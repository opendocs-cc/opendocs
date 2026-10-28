import { z } from "zod";

import { ApiError } from "../api-client";
import type { ToolContext } from "../lib/context";
import { UserFacingError } from "../lib/errors";
import { fail, ok } from "../lib/result";
import { defineTool, DESTRUCTIVE, DESTRUCTIVE_SHARED, READ_ONLY, WRITE, WRITE_SHARED } from "./types";

/**
 * Google Drive and e-signatures (DocuSeal): save a document to a Drive
 * folder the workspace named, and draft, confirm, track, cancel and file
 * signature requests. The same routes as the CLI's `opendocs save` and
 * `opendocs sign`, with download links instead of files. Signing is always
 * two steps: a draft read back to the user, then a send after their yes.
 */

type StoredFile = {
  id: string;
  name: string;
  url: string;
  bytes?: number;
  sha256: string;
  driveSha256: string | null;
  verified: boolean;
  locked?: boolean;
};

type StorageRun = {
  id: string;
  provider: string;
  destination: { id: string; name: string; url?: string };
  document: { id: string; slug: string; title: string; versionNumber: number };
  file: StoredFile & { format: string };
};

type SignerStatus = "draft" | "awaiting" | "sent" | "opened" | "completed" | "declined";

type SignatureRequest = {
  id: string;
  workspaceId?: string;
  status: string;
  provider: string;
  document: { postId: string | null; slug: string | null; title: string; versionNumber: number; sha256: string | null; fileName?: string };
  signers: Array<{
    name: string;
    email: string;
    role: string | null;
    order: number;
    status: SignerStatus | string;
    completedAt?: string;
    declineReason?: string;
  }>;
  order: "sequential" | "parallel";
  message: { subject?: string | null; body?: string | null } | null;
  expiresAt: string | null;
  fileTo: { id: string; name: string | null } | null;
  confirmation: { mode: "chat" | "browser"; approveUrl: string };
  sentAt?: string | null;
  completedAt?: string | null;
  filed?: {
    destination: { id?: string; name: string } | string;
    files: Array<{ kind?: string; name: string; url: string }>;
  } | null;
  warnings?: string[];
  lastError?: string | null;
  createdAt?: string;
};

type DownloadLink = { url: string; filename: string; expiresAt: string };

type PostRef = { id: string; workspaceId: string; title: string; slug: string };

const STATUSES = ["draft", "pending", "completed", "declined", "expired", "cancelled", "failed"] as const;
const MAX_SIGNERS = 10;
const MAX_ROLE_LENGTH = 60;

// The CLI's rule: one @, no spaces or brackets, a dot in the domain and a
// TLD of 2+ characters. Catches the typos that matter (missing @, "gmail"
// without ".com", stray commas) without rejecting real addresses.
const EMAIL_RE = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:.]{2,}$/;

const SIGNER_STATUS_LABELS: Record<string, string> = {
  draft: "not sent",
  awaiting: "waiting for the previous signer",
  sent: "email sent",
  opened: "opened",
  completed: "signed",
  declined: "declined",
};

const docArg = z
  .string()
  .min(1)
  .describe("The document's link (opendocs.cc or a custom domain), slug or ID.");
const folderArg = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe("A Google Drive folder name exactly as get_account lists it. Never guess one.");
const requestIdArg = z.string().trim().min(1).max(100).describe("The signature request ID.");
const versionArg = z.number().int().positive().optional().describe("An earlier version number (default: the current one).");

async function getPost(ctx: ToolContext, document: string): Promise<PostRef> {
  const target = await ctx.resolveDocument(document);
  const { post } = await ctx.api.get<{ post: PostRef }>(`/posts/${encodeURIComponent(target.ref)}`, ctx.docQuery(target));
  return post;
}

function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 12) : "unknown";
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
}

function timestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Whether Google's own checksum matched the file OpenDocs uploaded. */
function checksumLine(file: Pick<StoredFile, "sha256" | "driveSha256" | "verified">): string {
  if (file.verified && file.driveSha256) {
    return `Verified: Google Drive's checksum matches the file OpenDocs made (SHA-256 ${shortSha(file.sha256)}).`;
  }
  if (!file.driveSha256) {
    return `Not verified: Google Drive didn't report a checksum (OpenDocs' SHA-256 ${shortSha(file.sha256)}).`;
  }
  return `Warning: Google Drive's checksum (${shortSha(file.driveSha256)}) doesn't match the file OpenDocs made (${shortSha(file.sha256)}). Ask the user to check the file in Drive.`;
}

function orderLine(order: SignatureRequest["order"]): string {
  return order === "parallel"
    ? "parallel: everyone is emailed at once"
    : "sequential: each signer is emailed after the previous one has signed";
}

/**
 * The read-back block (the CLI's printSignatureSummary): document, version
 * and short hash, signers in order, email text, expiry, filing and warnings.
 */
function signatureSummary(req: SignatureRequest, opts: { withStatus?: boolean } = {}): string[] {
  const doc = req.document;
  const lines = [`Document: ${doc.title} (v${doc.versionNumber}, SHA-256 ${shortSha(doc.sha256)})`];
  if (opts.withStatus) {
    const when = [
      req.sentAt ? `sent ${timestamp(req.sentAt)}` : null,
      req.completedAt ? `completed ${timestamp(req.completedAt)}` : null,
    ].filter(Boolean);
    lines.push(`Status: ${req.status}${when.length ? ` (${when.join(", ")})` : ""}`);
  }
  lines.push(`Request: ${req.id}`);
  lines.push(`Signers (${orderLine(req.order)}):`);
  const signers = [...req.signers].sort((a, b) => a.order - b.order);
  signers.forEach((s, i) => {
    const status = opts.withStatus ? ` · ${SIGNER_STATUS_LABELS[s.status] ?? s.status}` : "";
    const declined = opts.withStatus && s.declineReason ? ` ("${s.declineReason}")` : "";
    lines.push(`${s.order || i + 1}. ${s.name} <${s.email}>${s.role ? ` — ${s.role}` : ""}${status}${declined}`);
  });

  const subject = req.message?.subject?.trim();
  const body = req.message?.body?.trim();
  if (!subject && !body) {
    lines.push("Email: the standard DocuSeal invitation (no custom subject or message)");
  } else {
    if (subject) lines.push(`Subject: ${subject}`);
    if (body) lines.push(`Message: ${body}`);
  }
  lines.push(`Expires: ${dateOnly(req.expiresAt) ?? "no expiry date"}`);
  lines.push(
    `File to: ${req.fileTo ? `${req.fileTo.name ?? "a Drive folder"} (Google Drive, once everyone has signed)` : "not filed automatically"}`,
  );
  if (req.filed && req.filed.files.length > 0) {
    const dest = typeof req.filed.destination === "string" ? req.filed.destination : req.filed.destination?.name;
    lines.push(`Filed${dest ? ` to ${dest}` : ""}:`);
    for (const f of req.filed.files) lines.push(f.name, f.url);
  }
  for (const w of req.warnings ?? []) lines.push(`Warning: ${w}`);
  if (req.lastError) lines.push(`Warning: the last attempt to send failed: ${req.lastError}`);
  return lines;
}

/** What to do next with this request (the CLI's printNextStep, in tool terms). */
function nextStep(req: SignatureRequest): string[] {
  switch (req.status) {
    case "draft":
      if (req.confirmation.mode === "browser") {
        return [
          "Next step: this workspace sends signature requests from the browser. Ask the user to open this link, check the request and click Send:",
          req.confirmation.approveUrl,
          "Don't call send_signature_request; it can't send in this workspace.",
        ];
      }
      return [
        "Next step: read this back to the user (document and version, every signer's name and email, the order, the email text, the expiry and the filing folder, plus any warnings) and offer them the draft PDF. Only after an explicit yes, call send_signature_request with this request_id and confirm: true. \"Looks fine?\" or silence is not a yes. If they want changes, cancel this draft with cancel_signature_request and create a new one.",
      ];
    case "pending":
      return ["Follow up with get_signature_request when the user asks; don't check in a loop."];
    case "completed":
      return req.filed ? [] : ["To save the signed PDF and signing certificate in Drive, use file_signed_documents with a folder name."];
    default:
      return [];
  }
}

async function downloadLink(
  ctx: ToolContext,
  requestId: string,
  document: "draft" | "signed" | "audit",
): Promise<DownloadLink | null> {
  return ctx.api
    .post<DownloadLink>("/download-links", { kind: "signature_document", requestId, document })
    .catch(() => null);
}

function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && !email.includes("..");
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The CLI's signer checks: a name, a real-looking email, unique valid roles. */
function checkSigners(signers: Array<{ name: string; email: string; role?: string }>) {
  const ask = "Ask the user for the missing or wrong details; never guess or complete a name or email.";
  const seen = new Map<string, string>();
  for (const [i, s] of signers.entries()) {
    const who = s.name || s.email || `Signer ${i + 1}`;
    if (!s.name) throw new UserFacingError(`Signer ${i + 1} (${s.email || "no email"}) has no name. ${ask}`, "invalid_signers");
    if (/[<>\n\r]/.test(s.name)) {
      throw new UserFacingError(`Signer ${i + 1}'s name "${s.name}" contains < > or a line break; give the name alone.`, "invalid_signers");
    }
    if (!isValidEmail(s.email)) {
      throw new UserFacingError(`"${s.email}" (${who}) isn't a valid email address. ${ask}`, "invalid_signers");
    }
    if (s.role) {
      if (s.role.length > MAX_ROLE_LENGTH) {
        throw new UserFacingError(`${who}'s role is longer than ${MAX_ROLE_LENGTH} characters.`, "invalid_signers");
      }
      if (/[;{}=\n\r]/.test(s.role)) {
        throw new UserFacingError(`${who}'s role "${s.role}" can't contain ; { } = or line breaks.`, "invalid_signers");
      }
      const key = s.role.toLowerCase();
      const other = seen.get(key);
      if (other) {
        throw new UserFacingError(
          `The role "${s.role}" is given to both ${other} and ${s.name}. Each role has exactly one signer.`,
          "invalid_signers",
        );
      }
      seen.set(key, s.name);
    }
  }
}

function requestStructured(req: SignatureRequest) {
  return {
    id: req.id,
    status: req.status,
    document: req.document,
    signers: req.signers,
    order: req.order,
    message: req.message,
    expiresAt: req.expiresAt,
    fileTo: req.fileTo,
    confirmation: req.confirmation,
    sentAt: req.sentAt ?? null,
    completedAt: req.completedAt ?? null,
    filed: req.filed ?? null,
    warnings: req.warnings ?? [],
    lastError: req.lastError ?? null,
    nextStep: nextStep(req).join("\n") || null,
  };
}

function approvalRequired(approveUrl: string, requestId: string) {
  return fail(
    [
      "Not sent: this workspace sends signature requests from the browser. Ask the user to open this link, check the request and click Send:",
      approveUrl,
      "Don't retry send_signature_request.",
    ].join("\n"),
    { error: "approval_required", requestId, approveUrl },
  );
}

export const saveToDrive = defineTool({
  name: "save_to_drive",
  title: "Save to Google Drive",
  description:
    "Save a document as a PDF (default), Word or Markdown file in one of the workspace's Google Drive folders. Only when the user asks to save or file it in Drive; publishing or exporting never implies it. Use a folder name exactly as get_account lists it and never guess one: if the user's words don't clearly match one name, ask. Give the user the Drive link on its own line. Needs Google Drive connected in the workspace (get_account shows it).",
  scope: "integrations",
  annotations: WRITE_SHARED,
  input: z.object({
    document: docArg,
    folder: folderArg,
    format: z.enum(["pdf", "docx", "md"]).default("pdf"),
    version: versionArg,
    filename: z.string().trim().min(1).max(180).optional().describe("File name in Drive without extension (default: the title)."),
  }),
  async run(args, ctx) {
    const post = await getPost(ctx, args.document);
    const result = await ctx.api.post<StorageRun>(
      `/posts/${encodeURIComponent(post.id)}/storage`,
      {
        workspaceId: post.workspaceId,
        destination: args.folder,
        format: args.format,
        ...(args.version ? { versionNumber: args.version } : {}),
        ...(args.filename ? { filename: args.filename } : {}),
      },
      undefined,
      120_000,
    );
    const size = formatBytes(result.file.bytes);
    return ok(
      [
        `Saved "${result.document.title}" (version ${result.document.versionNumber}) to the ${result.destination.name} folder in Google Drive as ${result.file.name}${size ? ` (${size})` : ""}:`,
        result.file.url,
        checksumLine(result.file),
      ].join("\n"),
      {
        folder: result.destination.name,
        folderLink: result.destination.url ?? null,
        document: result.document,
        file: {
          name: result.file.name,
          link: result.file.url,
          format: result.file.format,
          bytes: result.file.bytes ?? null,
          sha256: result.file.sha256,
          driveSha256: result.file.driveSha256,
          verified: result.file.verified,
        },
      },
    );
  },
});

export const createSignatureDraft = defineTool({
  name: "create_signature_draft",
  title: "Prepare a document for e-signature",
  description:
    "Create a draft signature request with DocuSeal. Nothing is emailed yet. Returns a summary of the draft (document and version, signers in signing order with name, email and role, subject, message, expiry, filing folder and any warnings) and a link to the exact PDF the signers will receive. Signer names and emails are used exactly as given, from the user or from the document's signature block. When the document has a signature block, each role in it needs exactly one signer with a matching role. Without one, a signature box per signer is added at the end of the document. Sending is a separate step: send_signature_request. Needs DocuSeal connected in the workspace (get_account shows it).",
  scope: "integrations",
  annotations: WRITE,
  input: z.object({
    document: docArg,
    signers: z
      .array(
        z.object({
          name: z.string().trim().max(120).describe("Full name exactly as the user or the document gives it."),
          email: z.string().trim().max(254),
          role: z.string().trim().optional().describe("The role in the document's signature block, like Employee."),
        }),
      )
      .min(1)
      .max(MAX_SIGNERS)
      .describe("The signers; their order matters only with order: sequential."),
    order: z
      .enum(["parallel", "sequential"])
      .default("parallel")
      .describe("parallel (default): everyone gets the email at once and signs in any order; sequential: one after another, in the order given, when the user asks for a signing order."),
    subject: z.string().trim().max(200).optional().describe("Email subject; leave out for DocuSeal's standard one."),
    message: z.string().trim().max(4000).optional().describe("Email message to the signers."),
    expires: z.string().trim().optional().describe("Expiry date, YYYY-MM-DD."),
    file_to: z.string().trim().min(1).max(200).optional().describe("Drive folder (exact name from get_account) for the signed PDF once everyone has signed."),
    version: versionArg,
  }),
  async run(args, ctx) {
    checkSigners(args.signers);
    if (args.expires !== undefined && !isValidDate(args.expires)) {
      throw new UserFacingError(`"${args.expires}" isn't a date; use YYYY-MM-DD, like 2026-11-30.`, "invalid_expiry");
    }
    const post = await getPost(ctx, args.document);
    const req = await ctx.api.post<SignatureRequest>(
      `/posts/${encodeURIComponent(post.id)}/signature-requests`,
      {
        workspaceId: post.workspaceId,
        signers: args.signers.map((s) => ({ name: s.name, email: s.email, ...(s.role ? { role: s.role } : {}) })),
        order: args.order,
        ...(args.subject || args.message
          ? { message: { ...(args.subject ? { subject: args.subject } : {}), ...(args.message ? { body: args.message } : {}) } }
          : {}),
        ...(args.expires ? { expiresAt: args.expires } : {}),
        ...(args.file_to ? { fileTo: args.file_to } : {}),
        ...(args.version ? { versionNumber: args.version } : {}),
      },
      undefined,
      120_000,
    );
    const draft = await downloadLink(ctx, req.id, "draft");
    const lines = ["Draft signature request created. Nothing has been sent yet.", "", ...signatureSummary(req)];
    if (draft) {
      lines.push("", "The exact PDF the signers will get (link valid for an hour):", draft.url);
    }
    lines.push("", ...nextStep(req));
    return ok(lines.join("\n"), { ...requestStructured(req), draftPdf: draft });
  },
});

export const sendSignatureRequest = defineTool({
  name: "send_signature_request",
  title: "Send for signature",
  description:
    "Send a draft signature request (made with create_signature_draft): DocuSeal emails each signer a link to sign, in the draft's order. This sends real email to the people in the draft and can't be unsent; a pending request can still be cancelled with cancel_signature_request. confirm: true records that the user approved sending the draft as summarised. If the workspace requires approving sends in the browser, it returns an approval link for the user instead.",
  scope: "integrations",
  annotations: DESTRUCTIVE_SHARED,
  input: z.object({
    request_id: requestIdArg,
    confirm: z.boolean().describe("true when the user approved sending this draft."),
  }),
  async run(args, ctx) {
    if (!args.confirm) {
      throw new UserFacingError(
        "Nothing was sent. Read the request back to the user (document, version, every signer's name and email, order, message, expiry, filing folder) and call again with confirm: true only after they say yes.",
        "confirmation_required",
      );
    }
    let req: SignatureRequest;
    try {
      req = await ctx.api.post<SignatureRequest>(
        `/signature-requests/${encodeURIComponent(args.request_id)}/send`,
        { confirm: true },
        undefined,
        120_000,
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "approval_required" && typeof err.body.approveUrl === "string") {
        return approvalRequired(err.body.approveUrl, args.request_id);
      }
      throw err;
    }
    if (req.status === "draft" && req.confirmation.mode === "browser") {
      return approvalRequired(req.confirmation.approveUrl, req.id);
    }
    const lines = [
      `Sent "${req.document.title}" (v${req.document.versionNumber}) for signature.`,
      "",
      ...signatureSummary(req, { withStatus: true }),
      "",
      ...nextStep(req),
    ];
    return ok(lines.join("\n"), { ...requestStructured(req), sent: true });
  },
});

export const listSignatureRequests = defineTool({
  name: "list_signature_requests",
  title: "List signature requests",
  description:
    "The workspace's signature requests, newest first (up to 50), with status and how many have signed. Filter by document or by status (draft, pending, completed, declined, expired, cancelled, failed). Use get_signature_request for one request's details.",
  scope: "integrations",
  annotations: READ_ONLY,
  input: z.object({
    document: docArg.optional(),
    status: z.enum(STATUSES).optional(),
    workspace: z
      .string()
      .optional()
      .describe("Workspace name, slug or ID. Defaults to the document's workspace, else this connection's default."),
  }),
  async run(args, ctx) {
    const post = args.document ? await getPost(ctx, args.document) : null;
    const workspaceId = post?.workspaceId ?? (await ctx.resolveWorkspace(args.workspace)).id;
    const { requests } = await ctx.api.get<{ requests: SignatureRequest[] }>("/signature-requests", {
      workspaceId,
      postId: post?.id,
      status: args.status,
    });
    const scope = (plural: boolean) =>
      `${args.status ? `${args.status} ` : ""}signature request${plural ? "s" : ""}${post ? ` for "${post.title}"` : ""}`;
    if (requests.length === 0) return ok(`No ${scope(true)}.`, { requests: [] });
    const lines = [`${requests.length} ${scope(requests.length !== 1)}, newest first:`];
    for (const r of requests) {
      const signed = r.signers.filter((s) => s.status === "completed").length;
      lines.push(
        `- ${r.document.title} (v${r.document.versionNumber}): ${r.status}, ${signed} of ${r.signers.length} signed${
          r.createdAt ? `, created ${r.createdAt.slice(0, 10)}` : ""
        }, id ${r.id}`,
      );
    }
    return ok(lines.join("\n"), {
      requests: requests.map((r) => ({
        id: r.id,
        status: r.status,
        title: r.document.title,
        version: r.document.versionNumber,
        signers: r.signers.map((s) => ({ name: s.name, email: s.email, role: s.role, status: s.status })),
        createdAt: r.createdAt ?? null,
        sentAt: r.sentAt ?? null,
        completedAt: r.completedAt ?? null,
      })),
    });
  },
});

export const getSignatureRequest = defineTool({
  name: "get_signature_request",
  title: "Check a signature request",
  description:
    "Where a signature request stands: its status, each signer's status (not sent, email sent, opened, signed, declined) and the details read back before sending. Once everyone has signed, it includes download links for the signed PDF and the audit log (signing certificate); for a draft, a link to the PDF that will be sent. Check only when the user asks; don't poll.",
  scope: "integrations",
  annotations: READ_ONLY,
  input: z.object({ request_id: requestIdArg }),
  async run(args, ctx) {
    const req = await ctx.api.get<SignatureRequest>(`/signature-requests/${encodeURIComponent(args.request_id)}`);
    const lines = signatureSummary(req, { withStatus: true });
    const links: Record<string, DownloadLink | null> = {};
    if (req.status === "completed") {
      const [signed, audit] = await Promise.all([
        downloadLink(ctx, req.id, "signed"),
        downloadLink(ctx, req.id, "audit"),
      ]);
      links.signed = signed;
      links.audit = audit;
      if (signed || audit) lines.push("", "Downloads (links valid for an hour):");
      if (signed) lines.push("Signed PDF:", signed.url);
      if (audit) lines.push("Audit log (signing certificate):", audit.url);
      if (!signed && !audit) lines.push("", "The signed PDF isn't available from DocuSeal yet; try again later.");
    } else if (req.status === "draft") {
      links.draft = await downloadLink(ctx, req.id, "draft");
      if (links.draft) lines.push("", "The exact PDF the signers will get (link valid for an hour):", links.draft.url);
    }
    const next = nextStep(req);
    if (next.length) lines.push("", ...next);
    return ok(lines.join("\n"), { ...requestStructured(req), downloads: links });
  },
});

export const cancelSignatureRequest = defineTool({
  name: "cancel_signature_request",
  title: "Cancel a signature request",
  description:
    "Cancel a draft or pending signature request; signers can no longer sign it. Also used to replace a draft that needs changes. confirm: true records that the user confirmed the cancellation. A completed request can't be cancelled.",
  scope: "integrations",
  annotations: DESTRUCTIVE,
  input: z.object({
    request_id: requestIdArg,
    confirm: z.boolean().describe("true when the user confirmed cancelling this request."),
  }),
  async run(args, ctx) {
    if (!args.confirm) {
      throw new UserFacingError(
        "Nothing was cancelled. Ask the user to confirm cancelling this signature request, then call again with confirm: true.",
        "confirmation_required",
      );
    }
    const req = await ctx.api.delete<SignatureRequest>(`/signature-requests/${encodeURIComponent(args.request_id)}`);
    return ok(
      `Cancelled the signature request for "${req.document.title}" (v${req.document.versionNumber}). ${
        req.sentAt ? "Signers can no longer sign it." : "It was never sent, so nobody was emailed."
      }`,
      { ...requestStructured(req), cancelled: true, signersEmailed: Boolean(req.sentAt) },
    );
  },
});

export const fileSignedDocuments = defineTool({
  name: "file_signed_documents",
  title: "File signed documents in Drive",
  description:
    "Save a completed signature request's signed PDF and audit log (signing certificate) in one of the workspace's Google Drive folders. Only when the user asks, and only once everyone has signed. Use a folder name exactly as get_account lists it; never guess one. (Requests created with file_to are filed automatically.) Give the user each Drive link on its own line.",
  scope: "integrations",
  annotations: WRITE_SHARED,
  input: z.object({ request_id: requestIdArg, folder: folderArg }),
  async run(args, ctx) {
    const result = await ctx.api.post<{
      destination: { id: string; name: string };
      files: Array<StoredFile & { kind: "signed" | "audit" }>;
    }>(
      `/signature-requests/${encodeURIComponent(args.request_id)}/storage`,
      { destination: args.folder },
      undefined,
      120_000,
    );
    const lines = [
      `Saved ${result.files.length} file${result.files.length === 1 ? "" : "s"} to the ${result.destination.name} folder in Google Drive:`,
    ];
    for (const f of result.files) {
      lines.push("", `${f.name} (${f.kind === "audit" ? "audit log" : "signed PDF"})`, f.url, checksumLine(f));
    }
    return ok(lines.join("\n"), {
      folder: result.destination.name,
      files: result.files.map((f) => ({
        kind: f.kind,
        name: f.name,
        link: f.url,
        bytes: f.bytes ?? null,
        sha256: f.sha256,
        driveSha256: f.driveSha256,
        verified: f.verified,
        locked: f.locked ?? null,
      })),
    });
  },
});

export const integrationTools = [
  saveToDrive,
  createSignatureDraft,
  sendSignatureRequest,
  listSignatureRequests,
  getSignatureRequest,
  cancelSignatureRequest,
  fileSignedDocuments,
];
