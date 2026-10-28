/**
 * Signature requests: an agent (or a person) prepares a draft, a person
 * confirms it, OpenDocs sends it through the workspace's signature
 * provider (DocuSeal), and the signed PDF and audit log come back.
 *
 * Nothing reaches a signer until `sendSignatureRequest`. The workspace's
 * `signatureConfirmation` setting decides who may call it:
 *   - "chat" (default): an agent may send after the user said yes in chat.
 *   - "browser": only a signed-in person, from the approval page.
 *
 * The draft stores the exact PDF that will be sent and its SHA-256, so
 * what the user confirms is byte for byte what signers receive. Provider
 * state is always read from the provider's API; webhooks only trigger a
 * refresh, so a forged webhook can't mark anything signed.
 */
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import { integrationDestinations, posts, signatureRequests, signatureSigners } from "../db/schema";
import { findSignatureEntries, isValidSignatureRole, signatureBlockMarkdown } from "../markdown/signature-blocks";
import {
  DocuSealApiError,
  archiveDocuSealSubmission,
  createDocuSealSubmission,
  downloadDocuSealFile,
  getDocuSealDocuments,
  getDocuSealSubmission,
  verifyDocuSealWebhook,
  type DocuSealConfig,
  type DocuSealConnection,
  type DocuSealCredentials,
  type DocuSealSubmission,
  type DocuSealWebhookEvent,
} from "./docuseal";
import { MAX_SIGNERS } from "./providers";
import {
  dashboardIntegrationsUrl,
  getConnection,
  getConnectionById,
  getWorkspaceEmailDomains,
  isServiceError,
  markConnectionError,
  recordAudit,
  recordRun,
  requireIntegrationAccess,
  resolveDestination,
  type IntegrationActor,
  type ServiceError,
} from "./service";
import { safeFileName, saveFileToDestination, sha256Hex } from "./storage";

const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;
const SYNC_INTERVAL_MS = 30_000;

export type SignerInput = { name: string; email: string; role?: string | null };

type RequestRow = typeof signatureRequests.$inferSelect;
type SignerRow = typeof signatureSigners.$inferSelect;

export function approveUrl(requestId: string): string {
  return `${dashboardIntegrationsUrl()}/signatures/${requestId}`;
}

export function webhookToken(): string {
  return randomBytes(24).toString("base64url");
}

// ---- Views --------------------------------------------------------------

export type SignatureRequestView = ReturnType<typeof shapeRequest>;

function shapeRequest(
  row: RequestRow,
  signers: SignerRow[],
  extra: { postSlug?: string | null; fileToName?: string | null; mode: "chat" | "browser" },
) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    status: row.status,
    provider: row.provider,
    document: {
      postId: row.postId,
      slug: extra.postSlug ?? null,
      title: row.title,
      versionNumber: row.postVersionNumber,
      sha256: row.documentSha256,
      fileName: row.documentName,
    },
    signers: signers
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        name: s.name,
        email: s.email,
        role: s.role,
        order: s.signingOrder,
        status: s.status,
        ...(s.completedAt ? { completedAt: s.completedAt.toISOString() } : {}),
        ...(s.declineReason ? { declineReason: s.declineReason } : {}),
      })),
    order: row.signingOrder,
    message: row.message ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    fileTo: row.fileToDestinationId ? { id: row.fileToDestinationId, name: extra.fileToName ?? null } : null,
    confirmation: { mode: extra.mode, approveUrl: approveUrl(row.id) },
    sentAt: row.sentAt?.toISOString() ?? null,
    confirmedVia: row.confirmedVia,
    completedAt: row.completedAt?.toISOString() ?? null,
    filed: row.filed ?? null,
    // Why the last send failed, if it did. Not `error`: a view with a string
    // `error` would read as a ServiceError.
    lastError: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadRequest(id: string): Promise<{ row: RequestRow; signers: SignerRow[] } | null> {
  const database = getDbOrThrow();
  const [row] = await database.select().from(signatureRequests).where(eq(signatureRequests.id, id)).limit(1);
  if (!row) return null;
  const signers = await database
    .select()
    .from(signatureSigners)
    .where(eq(signatureSigners.requestId, id))
    .orderBy(asc(signatureSigners.position));
  return { row, signers };
}

async function view(row: RequestRow, signers: SignerRow[], mode: "chat" | "browser") {
  const database = getDbOrThrow();
  const [post] = row.postId
    ? await database.select({ slug: posts.slug }).from(posts).where(eq(posts.id, row.postId)).limit(1)
    : [];
  const [dest] = row.fileToDestinationId
    ? await database
        .select({ name: integrationDestinations.name })
        .from(integrationDestinations)
        .where(eq(integrationDestinations.id, row.fileToDestinationId))
        .limit(1)
    : [];
  return shapeRequest(row, signers, { postSlug: post?.slug, fileToName: dest?.name, mode });
}

async function docuSealConnection(workspaceId: string) {
  return getConnection<DocuSealConfig, DocuSealCredentials>(workspaceId, "docuseal") as Promise<DocuSealConnection | null>;
}

// ---- Draft ------------------------------------------------------------

function parseExpiry(raw: string | null | undefined): Date | null | ServiceError {
  if (!raw) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw.trim());
  const date = new Date(dateOnly ? `${raw.trim()}T23:59:59.000Z` : raw);
  if (Number.isNaN(date.getTime())) return { error: "invalid_expiry", message: "expiresAt must be a date like 2026-11-30." };
  if (date.getTime() < Date.now() + 60 * 60 * 1000) {
    return { error: "invalid_expiry", message: "expiresAt must be at least an hour from now." };
  }
  return date;
}

/**
 * Give every signer a signature role, keeping the caller's order.
 * Without a signature block in the document, roles are the ones given or
 * "Signer 1", "Signer 2"…; with one, every role in it needs exactly one
 * signer, matched by an explicit role or else by name.
 */
export function assignSignerRoles(
  signers: SignerInput[],
  entries: Array<{ role: string; name?: string }>,
): Array<SignerInput & { role: string }> | ServiceError {
  if (entries.length === 0) {
    const assigned = signers.map((s, i) => ({ ...s, role: s.role?.trim() || `Signer ${i + 1}` }));
    const seen = new Set<string>();
    for (const s of assigned) {
      if (!isValidSignatureRole(s.role) || seen.has(s.role.toLowerCase())) {
        return {
          error: "invalid_signers",
          message: `Signer role "${s.role}" is invalid or repeated. Roles must be unique, at most 60 characters, without ; { } =.`,
        };
      }
      seen.add(s.role.toLowerCase());
    }
    return assigned;
  }

  const roles = entries.map((e) => e.role);
  const mismatch = (detail: string): ServiceError => ({
    error: "signer_roles_mismatch",
    roles,
    message: `${detail} This document's signature block has these roles: ${roles.join(", ")}. Give each one exactly one signer, e.g. --signer "${roles[0]}=Name <email>".`,
  });
  if (signers.length !== roles.length) {
    return mismatch(`${signers.length} signer(s) for ${roles.length} signature role(s).`);
  }

  const assigned = new Map<number, string>();
  const taken = new Set<string>();
  for (const [i, s] of signers.entries()) {
    if (!s.role?.trim()) continue;
    const role = roles.find((r) => r.toLowerCase() === s.role!.trim().toLowerCase());
    if (!role || taken.has(role)) return mismatch(`No free signature role "${s.role}".`);
    taken.add(role);
    assigned.set(i, role);
  }
  for (const [i, s] of signers.entries()) {
    if (assigned.has(i)) continue;
    const entry = entries.find(
      (e) => !taken.has(e.role) && e.name?.trim().toLowerCase() === s.name.trim().toLowerCase(),
    );
    if (!entry) return mismatch(`Can't tell which signature role "${s.name}" signs.`);
    taken.add(entry.role);
    assigned.set(i, entry.role);
  }
  return signers.map((s, i) => ({ ...s, role: assigned.get(i)! }));
}

export async function createSignatureDraft(input: {
  actor: IntegrationActor;
  workspaceId: string;
  post: { id: string; slug: string; title: string; versionNumber: number; markdown: string };
  signers: SignerInput[];
  order?: "sequential" | "parallel";
  message?: { subject?: string; body?: string } | null;
  expiresAt?: string | null;
  fileTo?: string | null;
  renderPdf: (markdown: string) => Promise<Buffer>;
}) {
  const access = await requireIntegrationAccess(input.actor.userId, input.workspaceId, "use");
  if (isServiceError(access)) return access;
  const connection = await docuSealConnection(input.workspaceId);
  if (!connection) return { error: "integration_not_connected", provider: "docuseal" } as ServiceError;
  if (connection.status === "error") return { error: "reconnect_required", provider: "docuseal" } as ServiceError;

  // Signers
  if (input.signers.length === 0 || input.signers.length > MAX_SIGNERS) {
    return { error: "invalid_signers", message: `Give between 1 and ${MAX_SIGNERS} signers.` } as ServiceError;
  }
  const signers = input.signers.map((s) => ({
    name: s.name.trim().replace(/\s+/g, " "),
    email: s.email.trim().toLowerCase(),
    role: s.role?.trim() || null,
  }));
  for (const s of signers) {
    if (!s.name || s.name.length > 120) {
      return { error: "invalid_signers", message: "Every signer needs a name (at most 120 characters)." } as ServiceError;
    }
    if (!EMAIL.test(s.email) || s.email.length > 254) {
      return { error: "invalid_signers", message: `"${s.email}" isn't a valid email address.` } as ServiceError;
    }
  }

  // Roles: the document's signature block decides them, or we add one.
  const entries = findSignatureEntries(input.post.markdown);
  const ordered = assignSignerRoles(signers, entries);
  if (isServiceError(ordered)) return ordered;

  const expiresAt = parseExpiry(input.expiresAt);
  if (isServiceError(expiresAt)) return expiresAt;

  let fileToId: string | null = null;
  let fileToName: string | null = null;
  if (input.fileTo?.trim()) {
    const dest = await resolveDestination(input.workspaceId, input.fileTo);
    if (isServiceError(dest)) return dest;
    fileToId = dest.id;
    fileToName = dest.name;
  }

  const message = {
    ...(input.message?.subject?.trim() ? { subject: input.message.subject.trim().slice(0, 200) } : {}),
    ...(input.message?.body?.trim() ? { body: input.message.body.trim().slice(0, 4000) } : {}),
  };

  const markdown =
    entries.length > 0
      ? input.post.markdown
      : `${input.post.markdown.replace(/\s+$/, "")}\n\n${signatureBlockMarkdown(
          ordered.map((s) => ({ role: s.role, name: s.name })),
        )}\n`;
  const pdf = await input.renderPdf(markdown);
  const documentName = safeFileName(`${input.post.title} (v${input.post.versionNumber})`, "pdf");

  // Warn about signers outside the workspace's email domains.
  const domains = await getWorkspaceEmailDomains(input.workspaceId);
  const warnings = ordered
    .filter((s) => domains.size > 0 && !domains.has(s.email.split("@")[1]))
    .map((s) => `${s.email} is outside your workspace's email domains.`);

  const database = getDbOrThrow();
  const [row] = await database
    .insert(signatureRequests)
    .values({
      workspaceId: input.workspaceId,
      integrationId: connection.id,
      provider: "docuseal",
      postId: input.post.id,
      postVersionNumber: input.post.versionNumber,
      title: input.post.title.slice(0, 255),
      status: "draft",
      // Everyone signs at once unless an order was asked for.
      signingOrder: input.order === "sequential" ? "sequential" : "parallel",
      message: Object.keys(message).length ? message : null,
      expiresAt,
      documentName,
      documentSha256: sha256Hex(pdf),
      documentPdf: pdf,
      fileToDestinationId: fileToId,
      createdByUserId: input.actor.userId,
      createdVia: input.actor.authMethod,
      client: input.actor.client?.slice(0, 120) ?? null,
    })
    .returning();
  const signerRows = await database
    .insert(signatureSigners)
    .values(
      ordered.map((s, i) => ({
        requestId: row.id,
        position: i,
        name: s.name,
        email: s.email,
        role: s.role,
        signingOrder: input.order === "parallel" ? 1 : i + 1,
        status: "draft",
      })),
    )
    .returning();

  await recordAudit(
    input.workspaceId,
    input.actor.userId,
    "signature_requested",
    { requestId: row.id, signers: ordered.map((s) => s.email), sha256: row.documentSha256, client: input.actor.client ?? null },
    input.post.id,
  );

  const shaped = shapeRequest(row, signerRows, {
    postSlug: input.post.slug,
    fileToName,
    mode: access.settings.signatureConfirmation,
  });
  return { ...shaped, warnings };
}

// ---- Send ---------------------------------------------------------------

/** Statuses DocuSeal reports for a submitter, mapped to ours. */
function signerStatus(s: { status?: string; completed_at?: string | null; declined_at?: string | null; opened_at?: string | null }) {
  if (s.declined_at || s.status === "declined") return "declined";
  if (s.completed_at || s.status === "completed") return "completed";
  if (s.opened_at || s.status === "opened") return "opened";
  if (s.status === "awaiting") return "awaiting";
  return "sent";
}

export async function sendSignatureRequest(input: { actor: IntegrationActor; requestId: string }) {
  const loaded = await loadRequest(input.requestId);
  if (!loaded) return { error: "not_found" } as ServiceError;
  const { row, signers } = loaded;
  const access = await requireIntegrationAccess(input.actor.userId, row.workspaceId, "use");
  if (isServiceError(access)) return access;

  if (row.status !== "draft") return { error: "already_sent", status: row.status } as ServiceError;
  if (access.settings.signatureConfirmation === "browser" && input.actor.authMethod !== "session") {
    return { error: "approval_required", approveUrl: approveUrl(row.id) } as ServiceError;
  }
  if (!row.documentPdf) return { error: "send_failed", message: "The draft's document is missing. Create the request again." } as ServiceError;

  const connection = await docuSealConnection(row.workspaceId);
  if (!connection) return { error: "integration_not_connected", provider: "docuseal" } as ServiceError;
  if (connection.status === "error") return { error: "reconnect_required", provider: "docuseal" } as ServiceError;

  const database = getDbOrThrow();
  // Claim the draft so two confirmations can't both send it.
  const claimed = await database
    .update(signatureRequests)
    .set({ status: "sending", updatedAt: new Date() })
    .where(and(eq(signatureRequests.id, row.id), eq(signatureRequests.status, "draft")))
    .returning({ id: signatureRequests.id });
  if (claimed.length === 0) return { error: "already_sent", status: "pending" } as ServiceError;

  let submission: DocuSealSubmission;
  try {
    submission = await createDocuSealSubmission(connection, {
      name: row.title,
      documentName: row.documentName,
      pdf: row.documentPdf,
      order: row.signingOrder === "parallel" ? "parallel" : "sequential",
      submitters: signers.map((s) => ({ role: s.role, name: s.name, email: s.email, externalId: s.id })),
      message: row.message,
      expiresAt: row.expiresAt,
      metadata: { opendocsRequestId: row.id, opendocsSha256: row.documentSha256 },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await database
      .update(signatureRequests)
      .set({ status: "draft", error: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(signatureRequests.id, row.id));
    if (err instanceof DocuSealApiError && err.status === 401) {
      await markConnectionError(connection.id, "DocuSeal rejected the API key. Reconnect DocuSeal.");
      return { error: "reconnect_required", provider: "docuseal" } as ServiceError;
    }
    return { error: "send_failed", message: `DocuSeal: ${message}` } as ServiceError;
  }

  const now = new Date();
  const [updated] = await database
    .update(signatureRequests)
    .set({
      status: "pending",
      externalId: String(submission.id),
      externalUrl: submission.url ?? null,
      confirmedByUserId: input.actor.userId,
      confirmedVia: input.actor.authMethod === "session" ? "browser" : "chat",
      sentAt: now,
      lastSyncedAt: now,
      // DocuSeal has the document now; keep only its hash.
      documentPdf: null,
      error: null,
      updatedAt: now,
    })
    .where(eq(signatureRequests.id, row.id))
    .returning();
  const updatedSigners = await applySubmitters(signers, submission);

  await recordAudit(
    row.workspaceId,
    input.actor.userId,
    "signature_sent",
    { requestId: row.id, externalId: String(submission.id), confirmedVia: updated.confirmedVia, client: input.actor.client ?? null },
    row.postId,
  );
  return view(updated, updatedSigners, access.settings.signatureConfirmation);
}

async function applySubmitters(signers: SignerRow[], submission: DocuSealSubmission): Promise<SignerRow[]> {
  const database = getDbOrThrow();
  const out: SignerRow[] = [];
  for (const signer of signers) {
    const match =
      submission.submitters.find((s) => s.external_id === signer.id) ??
      submission.submitters.find((s) => s.role === signer.role && s.email?.toLowerCase() === signer.email);
    if (!match) {
      out.push(signer);
      continue;
    }
    const status = signerStatus(match);
    const [row] = await database
      .update(signatureSigners)
      .set({
        externalId: String(match.id),
        status,
        completedAt: match.completed_at ? new Date(match.completed_at) : null,
        declineReason: match.decline_reason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(signatureSigners.id, signer.id))
      .returning();
    out.push(row);
  }
  return out;
}

// ---- Status -----------------------------------------------------------

function overallStatus(submission: DocuSealSubmission, signers: SignerRow[]): string {
  if (submission.archived_at) return "cancelled";
  const status = submission.status;
  if (status === "completed" || (signers.length > 0 && signers.every((s) => s.status === "completed"))) return "completed";
  if (status === "declined" || signers.some((s) => s.status === "declined")) return "declined";
  if (status === "expired") return "expired";
  return "pending";
}

/** Refresh a pending request from the provider; file it if it just completed. */
export async function syncSignatureRequest(requestId: string, opts: { force?: boolean } = {}) {
  const loaded = await loadRequest(requestId);
  if (!loaded) return null;
  const { row, signers } = loaded;
  if (row.status !== "pending" || !row.externalId) return loaded;
  if (!opts.force && row.lastSyncedAt && Date.now() - row.lastSyncedAt.getTime() < SYNC_INTERVAL_MS) return loaded;

  const connection = await docuSealConnection(row.workspaceId);
  if (!connection) return loaded;
  let submission: DocuSealSubmission;
  try {
    submission = await getDocuSealSubmission(connection, row.externalId);
  } catch (err) {
    if (err instanceof DocuSealApiError && err.status === 401) {
      await markConnectionError(connection.id, "DocuSeal rejected the API key. Reconnect DocuSeal.");
    }
    return loaded;
  }
  const updatedSigners = await applySubmitters(signers, submission);
  const status = overallStatus(submission, updatedSigners);
  const database = getDbOrThrow();
  const completedAt =
    status === "completed" ? new Date(submission.completed_at ?? Date.now()) : row.completedAt;
  // Only while still pending: a webhook and a poll can sync at the same
  // time, and only one of them should record completion and file the PDFs.
  const [updated] = await database
    .update(signatureRequests)
    .set({ status, completedAt, lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(signatureRequests.id, row.id), eq(signatureRequests.status, "pending")))
    .returning();
  if (!updated) return loadRequest(row.id);

  if (status === "completed") {
    await recordAudit(row.workspaceId, null, "signature_completed", { requestId: row.id, externalId: row.externalId }, row.postId);
    if (updated.fileToDestinationId && !updated.filed) {
      await fileSignedDocuments({ actor: null, requestId: row.id, destination: updated.fileToDestinationId });
      return loadRequest(row.id);
    }
  }
  return { row: updated, signers: updatedSigners };
}

export async function getSignatureRequest(userId: string, requestId: string) {
  const loaded = await loadRequest(requestId);
  if (!loaded) return { error: "not_found" } as ServiceError;
  const access = await requireIntegrationAccess(userId, loaded.row.workspaceId, "use");
  if (isServiceError(access)) return access.error === "forbidden" || access.error === "not_found" ? ({ error: "not_found" } as ServiceError) : access;
  const fresh = (await syncSignatureRequest(requestId)) ?? loaded;
  return view(fresh.row, fresh.signers, access.settings.signatureConfirmation);
}

export async function listSignatureRequests(
  userId: string,
  workspaceId: string,
  filter: { postId?: string | null; status?: string | null } = {},
) {
  const access = await requireIntegrationAccess(userId, workspaceId, "use");
  if (isServiceError(access)) return access;
  const database = getDbOrThrow();
  const clauses = [eq(signatureRequests.workspaceId, workspaceId)];
  if (filter.postId) clauses.push(eq(signatureRequests.postId, filter.postId));
  if (filter.status) clauses.push(eq(signatureRequests.status, filter.status));
  const rows = await database
    .select()
    .from(signatureRequests)
    .where(and(...clauses))
    .orderBy(desc(signatureRequests.createdAt))
    .limit(50);
  const ids = rows.map((r) => r.id);
  const signers = ids.length
    ? await database.select().from(signatureSigners).where(inArray(signatureSigners.requestId, ids))
    : [];
  const requests = [];
  for (const row of rows) {
    requests.push(await view(row, signers.filter((s) => s.requestId === row.id), access.settings.signatureConfirmation));
  }
  return { requests };
}

// ---- Cancel -----------------------------------------------------------

export async function cancelSignatureRequest(input: { actor: IntegrationActor; requestId: string }) {
  const loaded = await loadRequest(input.requestId);
  if (!loaded) return { error: "not_found" } as ServiceError;
  const { row, signers } = loaded;
  const access = await requireIntegrationAccess(input.actor.userId, row.workspaceId, "use");
  if (isServiceError(access)) return access;
  if (row.status === "completed") return { error: "already_completed" } as ServiceError;
  if (row.status === "cancelled") return view(row, signers, access.settings.signatureConfirmation);

  if (row.status === "pending" && row.externalId) {
    const connection = await docuSealConnection(row.workspaceId);
    if (connection) {
      try {
        await archiveDocuSealSubmission(connection, row.externalId);
      } catch (err) {
        if (!(err instanceof DocuSealApiError && err.status === 404)) {
          return { error: "cancel_failed", message: err instanceof Error ? err.message : String(err) } as ServiceError;
        }
      }
    }
  }
  const database = getDbOrThrow();
  const [updated] = await database
    .update(signatureRequests)
    .set({ status: "cancelled", documentPdf: null, updatedAt: new Date() })
    .where(eq(signatureRequests.id, row.id))
    .returning();
  await recordAudit(row.workspaceId, input.actor.userId, "signature_cancelled", { requestId: row.id }, row.postId);
  return view(updated, signers, access.settings.signatureConfirmation);
}

// ---- Signed documents ---------------------------------------------------

export type SignedDocumentKind = "signed" | "audit";

async function fetchSignedDocument(row: RequestRow, kind: SignedDocumentKind) {
  const connection = await docuSealConnection(row.workspaceId);
  if (!connection) return { error: "integration_not_connected", provider: "docuseal" } as ServiceError;
  const base = row.documentName.replace(/\.pdf$/i, "");
  try {
    if (kind === "audit") {
      const submission = await getDocuSealSubmission(connection, row.externalId!);
      if (!submission.audit_log_url) return { error: "not_available", message: "DocuSeal has no audit log for this request yet." } as ServiceError;
      return { buffer: await downloadDocuSealFile(submission.audit_log_url), filename: safeFileName(`${base} – audit log`, "pdf") };
    }
    const documents = await getDocuSealDocuments(connection, row.externalId!);
    if (!documents[0]) return { error: "not_available", message: "DocuSeal has no signed document for this request yet." } as ServiceError;
    return { buffer: await downloadDocuSealFile(documents[0].url), filename: safeFileName(`${base} – signed`, "pdf") };
  } catch (err) {
    return { error: "provider_failed", message: err instanceof Error ? err.message : String(err) } as ServiceError;
  }
}

export async function getSignedDocument(userId: string, requestId: string, kind: SignedDocumentKind) {
  const loaded = await loadRequest(requestId);
  if (!loaded) return { error: "not_found" } as ServiceError;
  const access = await requireIntegrationAccess(userId, loaded.row.workspaceId, "use");
  if (isServiceError(access)) return access;
  const fresh = (await syncSignatureRequest(requestId)) ?? loaded;
  if (fresh.row.status !== "completed" || !fresh.row.externalId) {
    return { error: "not_completed", status: fresh.row.status } as ServiceError;
  }
  return fetchSignedDocument(fresh.row, kind);
}

/** The exact PDF a draft will send, so a person can read it before confirming. */
export async function getDraftDocument(userId: string, requestId: string) {
  const loaded = await loadRequest(requestId);
  if (!loaded) return { error: "not_found" } as ServiceError;
  const access = await requireIntegrationAccess(userId, loaded.row.workspaceId, "use");
  if (isServiceError(access)) return access;
  if (!loaded.row.documentPdf) {
    return { error: "not_available", message: "The draft PDF is only kept until the request is sent." } as ServiceError;
  }
  return { buffer: Buffer.from(loaded.row.documentPdf), filename: loaded.row.documentName };
}

/** Save the signed PDF and the audit log to a destination, read-only. */
export async function fileSignedDocuments(input: {
  actor: IntegrationActor | null;
  requestId: string;
  destination: string;
}) {
  const loaded = await loadRequest(input.requestId);
  if (!loaded) return { error: "not_found" } as ServiceError;
  const { row } = loaded;
  if (input.actor) {
    const access = await requireIntegrationAccess(input.actor.userId, row.workspaceId, "use");
    if (isServiceError(access)) return access;
  }
  if (row.status !== "completed" || !row.externalId) return { error: "not_completed", status: row.status } as ServiceError;
  const destination = await resolveDestination(row.workspaceId, input.destination);
  if (isServiceError(destination)) return destination;

  const files = [];
  for (const kind of ["signed", "audit"] as const) {
    const doc = await fetchSignedDocument(row, kind);
    if (isServiceError(doc)) return doc;
    const saved = await saveFileToDestination({
      actor: input.actor,
      workspaceId: row.workspaceId,
      destination,
      file: { name: doc.filename, mimeType: "application/pdf", body: doc.buffer },
      appProperties: {
        odRequestId: row.id,
        odKind: kind,
        ...(row.postId ? { odPostId: row.postId } : {}),
        odVersion: String(row.postVersionNumber),
        odSha256: sha256Hex(doc.buffer),
      },
      description:
        kind === "signed"
          ? `Signed via DocuSeal. Sent from OpenDocs; original PDF SHA-256 ${row.documentSha256}.`
          : "DocuSeal audit log (Certificate of Signature).",
      lock: kind === "signed" ? "Signed – final" : "Audit log – final",
      ledger: {
        action: kind === "signed" ? "signature.file_signed" : "signature.file_audit",
        postId: row.postId,
        postVersionNumber: row.postVersionNumber,
        signatureRequestId: row.id,
      },
    });
    if (isServiceError(saved)) return saved;
    files.push({ kind, ...saved.file });
  }

  const filed = {
    destination: { id: destination.id, name: destination.name },
    files: files.map((f) => ({ kind: f.kind, name: f.name, url: f.url, sha256: f.sha256 })),
    at: new Date().toISOString(),
  };
  const database = getDbOrThrow();
  await database
    .update(signatureRequests)
    .set({ filed, updatedAt: new Date() })
    .where(eq(signatureRequests.id, row.id));
  return { destination: { id: destination.id, name: destination.name }, files };
}

// ---- Webhooks -----------------------------------------------------------

/**
 * A DocuSeal webhook for one connection. Authenticated by the token in its
 * URL and, when the workspace saved DocuSeal's signing secret, the HMAC
 * signature. Either way it only triggers a refresh from DocuSeal's API.
 */
export async function handleDocuSealWebhook(input: {
  integrationId: string;
  token: string | undefined;
  rawBody: Buffer;
  signatureHeader: string | undefined;
}): Promise<{ ok: true; synced: string | null } | ServiceError> {
  const connection = (await getConnectionById<DocuSealConfig, DocuSealCredentials & { webhookToken?: string }>(
    input.integrationId,
  )) as (DocuSealConnection & { credentials: DocuSealCredentials & { webhookToken?: string } }) | null;
  if (!connection || connection.provider !== "docuseal") return { error: "not_found" };
  if (!connection.credentials.webhookToken || input.token !== connection.credentials.webhookToken) {
    return { error: "unauthorized" };
  }
  if (
    connection.credentials.webhookSecret &&
    !verifyDocuSealWebhook({
      rawBody: input.rawBody,
      signatureHeader: input.signatureHeader,
      secret: connection.credentials.webhookSecret,
    })
  ) {
    return { error: "unauthorized" };
  }

  let event: DocuSealWebhookEvent;
  try {
    event = JSON.parse(input.rawBody.toString("utf8")) as DocuSealWebhookEvent;
  } catch {
    return { error: "invalid_payload" };
  }
  const submissionId = event.event_type?.startsWith("submission.")
    ? event.data?.id
    : (event.data?.submission?.id ?? event.data?.submission_id);
  if (!submissionId) return { ok: true, synced: null };

  const database = getDbOrThrow();
  const [row] = await database
    .select({ id: signatureRequests.id })
    .from(signatureRequests)
    .where(
      and(
        eq(signatureRequests.integrationId, connection.id),
        eq(signatureRequests.externalId, String(submissionId)),
      ),
    )
    .limit(1);
  if (!row) return { ok: true, synced: null };
  await syncSignatureRequest(row.id, { force: true });
  await recordRun({
    workspaceId: connection.workspaceId,
    integrationId: connection.id,
    provider: "docuseal",
    action: "signature.webhook",
    status: "succeeded",
    actor: null,
    signatureRequestId: row.id,
    request: { event: event.event_type ?? null },
  });
  return { ok: true, synced: row.id };
}
