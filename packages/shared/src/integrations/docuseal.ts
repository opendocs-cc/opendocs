/**
 * DocuSeal: e-signatures with the workspace's own DocuSeal account (Pro or
 * a self-hosted Pro instance; the API endpoints we use aren't in the free
 * open-source edition). Each workspace pastes an API key; requests are
 * billed to their account.
 *
 * API reference: https://www.docuseal.com/docs/api
 * Webhooks are added by the customer in DocuSeal's console (there's no API
 * for it) pointing at our per-connection URL, signed with the `whsec_…`
 * secret they paste here: https://www.docuseal.com/resources/use-webhooks
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { DOCUSEAL_REGIONS, type DocuSealRegion } from "./providers";
import type { StoredConnection } from "./service";

export type DocuSealConfig = { region: DocuSealRegion; baseUrl: string };
export type DocuSealCredentials = { apiKey: string; webhookSecret?: string | null };
export type DocuSealConnection = StoredConnection<DocuSealConfig, DocuSealCredentials>;

export class DocuSealApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DocuSealApiError";
  }
}

/** The API base URL for a region, or a validated self-hosted URL. */
export function docuSealBaseUrl(region: DocuSealRegion, customUrl?: string | null): string | null {
  if (region === "com" || region === "eu") return DOCUSEAL_REGIONS[region].baseUrl;
  if (!customUrl) return null;
  try {
    const url = new URL(customUrl.trim());
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    // Self-hosted instances serve the API under /api.
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${path.endsWith("/api") ? path : `${path}/api`}`;
  } catch {
    return null;
  }
}

async function call<T>(
  conn: { baseUrl: string; apiKey: string },
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${conn.baseUrl}${path}`, {
    ...init,
    headers: {
      "x-auth-token": conn.apiKey,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message =
      (body as { error?: string; message?: string } | null)?.error ??
      (body as { message?: string } | null)?.message ??
      `DocuSeal responded ${res.status}`;
    throw new DocuSealApiError(message, res.status);
  }
  return body as T;
}

function client(connection: DocuSealConnection) {
  return { baseUrl: connection.config.baseUrl, apiKey: connection.credentials.apiKey };
}

/**
 * Check a key before saving it. Returns the account's email when DocuSeal
 * tells us (best effort), or throws with DocuSeal's status.
 */
export async function verifyDocuSealKey(baseUrl: string, apiKey: string): Promise<{ account: string | null }> {
  await call(
    { baseUrl, apiKey },
    "/templates?limit=1",
  );
  const user = await call<{ email?: string } | null>({ baseUrl, apiKey }, "/user").catch(() => null);
  return { account: user?.email ?? null };
}

export type DocuSealSubmitter = {
  id: number;
  email: string;
  name?: string;
  role: string;
  status: string;
  external_id?: string | null;
  sent_at?: string | null;
  opened_at?: string | null;
  completed_at?: string | null;
  declined_at?: string | null;
  decline_reason?: string | null;
};

export type DocuSealSubmission = {
  id: number;
  status?: string;
  submitters: DocuSealSubmitter[];
  audit_log_url?: string | null;
  combined_document_url?: string | null;
  documents?: Array<{ name: string; url: string }>;
  archived_at?: string | null;
  completed_at?: string | null;
  expire_at?: string | null;
  url?: string | null;
};

/**
 * DocuSeal replaces its whole invitation email with a custom message and
 * only includes the signing link where the body has {{submitter.link}}.
 * A message written without it (as AI assistants do) reached signers with
 * no way to sign, so the link is always added. A subject without a body
 * gets wording like DocuSeal's own.
 */
export function signingEmailBody(body: string | null | undefined): string {
  const text = body?.trim();
  if (!text) {
    return 'Hello,\n\nYou have been invited to sign "{{template.name}}".\n\n{{submitter.link}}\n\nThanks,\n{{account.name}}';
  }
  if (/\{\{\s*submitter\.link\s*\}\}/.test(text)) return text;
  return `${text}\n\nReview and sign the document here:\n{{submitter.link}}`;
}

/**
 * Create a one-off submission from our PDF. Field positions come from the
 * text tags the converter put in the signature boxes; DocuSeal removes the
 * tags. `order: "preserved"` emails signers one after another, `"random"`
 * all at once.
 */
export async function createDocuSealSubmission(
  connection: DocuSealConnection,
  input: {
    name: string;
    documentName: string;
    pdf: Buffer;
    order: "sequential" | "parallel";
    submitters: Array<{ role: string; name: string; email: string; externalId: string }>;
    message?: { subject?: string; body?: string } | null;
    expiresAt?: Date | null;
    metadata: Record<string, string>;
  },
): Promise<DocuSealSubmission> {
  const body = {
    name: input.name,
    send_email: true,
    order: input.order === "parallel" ? "random" : "preserved",
    documents: [{ name: input.documentName, file: input.pdf.toString("base64") }],
    submitters: input.submitters.map((s) => ({
      role: s.role,
      name: s.name,
      email: s.email,
      external_id: s.externalId,
      metadata: input.metadata,
    })),
    ...(input.message?.subject || input.message?.body
      ? {
          message: {
            ...(input.message.subject ? { subject: input.message.subject } : {}),
            body: signingEmailBody(input.message.body),
          },
        }
      : {}),
    ...(input.expiresAt ? { expire_at: input.expiresAt.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC") } : {}),
  };
  const created = await call<DocuSealSubmission | DocuSealSubmitter[]>(client(connection), "/submissions/pdf", {
    method: "POST",
    body: JSON.stringify(body),
  });
  // /submissions/pdf returns the submission; template submissions return
  // an array of submitters. Normalise to a submission.
  if (Array.isArray(created)) {
    const submissionId = (created[0] as DocuSealSubmitter & { submission_id?: number })?.submission_id ?? 0;
    return { id: submissionId, submitters: created };
  }
  return created;
}

export async function getDocuSealSubmission(connection: DocuSealConnection, id: string): Promise<DocuSealSubmission> {
  return call<DocuSealSubmission>(client(connection), `/submissions/${encodeURIComponent(id)}`);
}

/** Signed documents of a completed submission, merged into one PDF. */
export async function getDocuSealDocuments(
  connection: DocuSealConnection,
  id: string,
): Promise<Array<{ name: string; url: string }>> {
  const res = await call<{ documents?: Array<{ name: string; url: string }> }>(
    client(connection),
    `/submissions/${encodeURIComponent(id)}/documents?merge=true`,
  );
  return res.documents ?? [];
}

/** Archive a submission so signers can no longer open it. */
export async function archiveDocuSealSubmission(connection: DocuSealConnection, id: string): Promise<void> {
  await call(client(connection), `/submissions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Download a document DocuSeal links to (signed PDF, audit log). */
export async function downloadDocuSealFile(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new DocuSealApiError(`Couldn't download the document (${res.status})`, res.status);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Verify `X-Docuseal-Signature: <timestamp>.<hex hmac>` where the HMAC is
 * SHA-256 over "<timestamp>.<raw body>" with the connection's secret.
 * Rejects anything older than five minutes.
 */
export function verifyDocuSealWebhook(input: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  secret: string;
  now?: number;
}): boolean {
  const header = input.signatureHeader?.trim();
  if (!header) return false;
  const dot = header.indexOf(".");
  if (dot <= 0) return false;
  const timestamp = header.slice(0, dot);
  const signature = header.slice(dot + 1);
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  const now = input.now ?? Date.now();
  const sentAt = seconds > 1e12 ? seconds : seconds * 1000;
  if (Math.abs(now - sentAt) > 5 * 60 * 1000) return false;

  const expected = createHmac("sha256", input.secret)
    .update(`${timestamp}.`)
    .update(input.rawBody)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type DocuSealWebhookEvent = {
  event_type: string;
  timestamp?: string;
  data: {
    id?: number;
    submission_id?: number;
    email?: string;
    role?: string;
    external_id?: string | null;
    status?: string;
    decline_reason?: string | null;
    completed_at?: string | null;
    submission?: { id: number; status?: string };
  };
};
