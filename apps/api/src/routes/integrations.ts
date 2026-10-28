import express, { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import { IntegrationsNotConfiguredError } from "@opendocs/shared/integrations/crypto";
import { MAX_SIGNERS, STORAGE_FORMATS } from "@opendocs/shared/integrations/providers";
import {
  dashboardIntegrationsUrl,
  getIntegrationsOverview,
  isServiceError,
  requireIntegrationAccess,
  resolveDestination,
  type IntegrationActor,
  type ServiceError,
} from "@opendocs/shared/integrations/service";
import {
  cancelSignatureRequest,
  createSignatureDraft,
  fileSignedDocuments,
  getDraftDocument,
  getSignatureRequest,
  getSignedDocument,
  handleDocuSealWebhook,
  listSignatureRequests,
  sendSignatureRequest,
} from "@opendocs/shared/integrations/signatures";
import { STORAGE_MIME_TYPES, safeFileName, saveFileToDestination } from "@opendocs/shared/integrations/storage";
import { instanceWebUrl } from "@opendocs/shared/config/instance";
import { requireAuth } from "../auth/middleware";
import { converterFailure } from "../lib/converter";
import { loadDocument, renderDocument } from "../lib/document-file";
import { isUuid } from "../lib/post-lookup";
import { readClient } from "../middleware/client";
import { exportRateLimit } from "../middleware/rate-limit";
import { validateBody } from "../middleware/validate";
import type { AuthenticatedRequest } from "../types";

/**
 * Integrations for agents and the dashboard: save a document to a named
 * Drive folder, and prepare, confirm and track signature requests. The
 * connecting itself (OAuth, API keys, picking folders) happens in the
 * dashboard; see apps/web/app/dashboard/integrations.
 */
const router = Router();

const PROVIDER_NAMES: Record<string, string> = { google_drive: "Google Drive", docuseal: "DocuSeal" };

const ERRORS: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: "Not found, or you don't have access to it." },
  plan_required: {
    status: 403,
    message: `Integrations are a Pro feature. Upgrade at ${instanceWebUrl()}/dashboard/billing.`,
  },
  forbidden: {
    status: 403,
    message: "This workspace lets only owners and admins use integrations. Ask one of them, or to change the setting.",
  },
  integration_not_connected: { status: 409, message: "That integration isn't connected to this workspace." },
  reconnect_required: { status: 409, message: "The integration needs to be reconnected." },
  destination_not_found: { status: 404, message: "No folder by that name." },
  destination_unavailable: { status: 409, message: "The folder is no longer available." },
  storage_failed: { status: 502, message: "Saving the file failed." },
  approval_required: {
    status: 403,
    message: "This workspace requires a person to approve signature requests in the browser.",
  },
  signer_roles_mismatch: { status: 400, message: "The signers don't match the document's signature block." },
  invalid_signers: { status: 400, message: "Invalid signers." },
  invalid_expiry: { status: 400, message: "expiresAt must be a future date (ISO 8601)." },
  already_sent: { status: 409, message: "This request has already been sent." },
  already_completed: { status: 409, message: "This request is already signed by everyone." },
  not_completed: { status: 409, message: "Not everyone has signed yet." },
  not_available: { status: 404, message: "DocuSeal doesn't have that document yet." },
  send_failed: { status: 502, message: "DocuSeal didn't accept the request." },
  cancel_failed: { status: 502, message: "DocuSeal didn't cancel the request." },
  provider_failed: { status: 502, message: "DocuSeal didn't respond as expected." },
  unauthorized: { status: 401, message: "Invalid webhook token or signature." },
  invalid_payload: { status: 400, message: "Invalid webhook payload." },
};

/** A message that says what to do next, with the dashboard link when a person has to act. */
function messageFor(result: ServiceError): string {
  const known = ERRORS[result.error];
  const provider = PROVIDER_NAMES[String(result.provider)] ?? "The integration";
  const dashboard = dashboardIntegrationsUrl();
  switch (result.error) {
    case "integration_not_connected":
      return `${provider} isn't connected to this workspace. An owner or admin can connect it at ${dashboard}.`;
    case "reconnect_required":
      return `${provider} needs to be reconnected (its access was revoked or expired). An owner or admin can reconnect it at ${dashboard}.`;
    case "destination_not_found": {
      const names = (result.destinations as string[] | undefined) ?? [];
      return names.length
        ? `No folder named "${String(result.destination)}". This workspace's folders: ${names.map((n) => `"${n}"`).join(", ")}.`
        : `This workspace has no Drive folders yet. An owner or admin can add them at ${dashboard}.`;
    }
    case "approval_required":
      return `This workspace requires a person to approve signature requests in the browser. Open ${String(result.approveUrl)} to review and send it.`;
    case "signer_roles_mismatch": {
      const roles = (result.roles as string[] | undefined) ?? [];
      return `The document's signature block has ${roles.length} signer${roles.length === 1 ? "" : "s"} (${roles.join(", ")}). Give one signer per role, with "role" set to match.`;
    }
    case "already_sent":
      return `This request has already been sent (status: ${String(result.status)}).`;
    case "not_completed":
      return `Not everyone has signed yet (status: ${String(result.status)}).`;
    default:
      return typeof result.message === "string" ? result.message : (known?.message ?? result.error);
  }
}

function sendServiceError(res: Response, result: ServiceError) {
  const status = ERRORS[result.error]?.status ?? 400;
  res.status(status).json({ ...result, message: messageFor(result) });
}

/**
 * Route wrapper: service errors become JSON, a missing encryption key a 503,
 * and a failed conversion (Drive saves, signature drafts) the same 502/504
 * as exports.
 */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof IntegrationsNotConfiguredError) {
        res.status(503).json({ error: "integrations_not_configured", message: err.message });
        return;
      }
      const failure = converterFailure(err);
      if (failure) {
        res.status(failure.status).json(failure.body);
        return;
      }
      next(err);
    }
  };
}

function actorOf(req: Request): IntegrationActor {
  const { userId, authMethod } = req as AuthenticatedRequest;
  return { userId, authMethod, client: readClient(req) };
}

/** `filename="ascii"` plus RFC 5987 `filename*` for names with dashes, accents and so on. */
function attachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]+/g, "-").replace(/["\\]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function documentNotFound(res: Response, postIdOrSlug: string, versionNumber?: number) {
  res.status(404).json({
    error: "not_found",
    message: versionNumber
      ? `No version ${versionNumber} of "${postIdOrSlug}" that you can read. Run \`opendocs history ${postIdOrSlug}\` to list versions.`
      : `No document "${postIdOrSlug}" that you can read in this workspace. Run \`opendocs list\` to see your documents.`,
  });
}

// ---- Overview -----------------------------------------------------------

router.get(
  "/integrations",
  requireAuth,
  handle(async (req, res) => {
    const { userId } = req as AuthenticatedRequest;
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ error: "missing_workspace_id", message: "Pass ?workspaceId=." });
      return;
    }
    const result = await getIntegrationsOverview(userId, workspaceId);
    if (isServiceError(result)) return sendServiceError(res, result);
    res.json(result);
  }),
);

// ---- Storage ------------------------------------------------------------

const storageBody = z.object({
  workspaceId: z.string().min(1).optional(),
  destination: z.string().trim().min(1).max(200),
  format: z.enum(STORAGE_FORMATS).default("pdf"),
  versionNumber: z.number().int().positive().optional(),
  filename: z.string().trim().min(1).max(180).optional(),
});

router.post(
  "/posts/:postIdOrSlug/storage",
  requireAuth,
  exportRateLimit,
  validateBody(storageBody),
  handle(async (req, res) => {
    const actor = actorOf(req);
    const body = req.body as z.infer<typeof storageBody>;
    const postIdOrSlug = String(req.params.postIdOrSlug);
    const doc = await loadDocument({
      userId: actor.userId,
      postIdOrSlug,
      workspaceId: body.workspaceId,
      versionNumber: body.versionNumber,
    });
    if (!doc) return documentNotFound(res, postIdOrSlug, body.versionNumber);

    // Check access and the folder before spending a conversion on it.
    const access = await requireIntegrationAccess(actor.userId, doc.workspaceId, "use");
    if (isServiceError(access)) return sendServiceError(res, access);
    const destination = await resolveDestination(doc.workspaceId, body.destination);
    if (isServiceError(destination)) return sendServiceError(res, { ...destination, provider: "google_drive" });

    const name = safeFileName(body.filename?.replace(/\.(pdf|docx|md)$/i, "") ?? doc.title, body.format);
    const fileBody = await renderDocument({
      workspaceId: doc.workspaceId,
      markdown: doc.markdown,
      format: body.format,
      filename: name,
    });
    const saved = await saveFileToDestination({
      actor,
      workspaceId: doc.workspaceId,
      destination,
      file: { name, mimeType: STORAGE_MIME_TYPES[body.format], body: fileBody },
      appProperties: { odPostId: doc.id, odVersion: String(doc.versionNumber), odFormat: body.format },
      description: `Saved from OpenDocs: "${doc.title}", version ${doc.versionNumber}.`,
      ledger: {
        action: "storage.save",
        postId: doc.id,
        postVersionNumber: doc.versionNumber,
        request: { format: body.format },
      },
    });
    if (isServiceError(saved)) return sendServiceError(res, saved);
    res.status(201).json({
      id: saved.runId,
      provider: "google_drive",
      destination: { id: saved.destination.id, name: saved.destination.name, url: saved.destination.url },
      document: { id: doc.id, slug: doc.slug, title: doc.title, versionNumber: doc.versionNumber },
      file: { ...saved.file, format: body.format },
    });
  }),
);

// ---- Signature requests -------------------------------------------------

const signer = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().min(3).max(254),
  role: z.string().trim().min(1).max(60).optional(),
});

const draftBody = z.object({
  workspaceId: z.string().min(1).optional(),
  signers: z.array(signer).min(1).max(MAX_SIGNERS),
  order: z.enum(["sequential", "parallel"]).default("parallel"),
  message: z
    .object({
      subject: z.string().trim().max(200).optional(),
      body: z.string().trim().max(4000, "The message can be at most 4000 characters.").optional(),
    })
    .optional(),
  expiresAt: z.string().trim().max(40).optional(),
  fileTo: z.string().trim().max(200).optional(),
  versionNumber: z.number().int().positive().optional(),
});

router.post(
  "/posts/:postIdOrSlug/signature-requests",
  requireAuth,
  exportRateLimit,
  validateBody(draftBody),
  handle(async (req, res) => {
    const actor = actorOf(req);
    const body = req.body as z.infer<typeof draftBody>;
    const postIdOrSlug = String(req.params.postIdOrSlug);
    const doc = await loadDocument({
      userId: actor.userId,
      postIdOrSlug,
      workspaceId: body.workspaceId,
      versionNumber: body.versionNumber,
    });
    if (!doc) return documentNotFound(res, postIdOrSlug, body.versionNumber);

    const result = await createSignatureDraft({
      actor,
      workspaceId: doc.workspaceId,
      post: doc,
      signers: body.signers,
      order: body.order,
      message: body.message ?? null,
      expiresAt: body.expiresAt ?? null,
      fileTo: body.fileTo ?? null,
      renderPdf: (markdown) =>
        renderDocument({
          workspaceId: doc.workspaceId,
          markdown,
          format: "pdf",
          filename: safeFileName(doc.title, "pdf"),
          signatureFields: true,
        }),
    });
    if (isServiceError(result)) return sendServiceError(res, result);
    res.status(201).json(result);
  }),
);

router.get(
  "/signature-requests",
  requireAuth,
  handle(async (req, res) => {
    const { userId } = req as AuthenticatedRequest;
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ error: "missing_workspace_id", message: "Pass ?workspaceId=." });
      return;
    }
    let postId: string | null = null;
    const post = typeof req.query.post === "string" ? req.query.post : typeof req.query.postId === "string" ? req.query.postId : "";
    if (post) {
      if (isUuid(post)) {
        postId = post;
      } else {
        const doc = await loadDocument({ userId, postIdOrSlug: post, workspaceId });
        if (!doc) return documentNotFound(res, post);
        postId = doc.id;
      }
    }
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const result = await listSignatureRequests(userId, workspaceId, { postId, status });
    if (isServiceError(result)) return sendServiceError(res, result);
    res.json(result);
  }),
);

router.get(
  "/signature-requests/:id",
  requireAuth,
  handle(async (req, res) => {
    const { userId } = req as AuthenticatedRequest;
    const result = await getSignatureRequest(userId, String(req.params.id));
    if (isServiceError(result)) return sendServiceError(res, result);
    res.json(result);
  }),
);

// `confirm: true` is the caller saying a person reviewed the signers. With
// an API key that means the user said yes in chat; workspaces that want a
// click in the browser instead get approval_required.
router.post(
  "/signature-requests/:id/send",
  requireAuth,
  (req, res, next) => {
    if ((req.body as { confirm?: unknown } | undefined)?.confirm !== true) {
      res.status(400).json({
        error: "confirmation_required",
        message:
          "Show the user the document, version, signers (names and emails) and order, and send with {\"confirm\": true} only after they say yes.",
      });
      return;
    }
    next();
  },
  handle(async (req, res) => {
    const result = await sendSignatureRequest({ actor: actorOf(req), requestId: String(req.params.id) });
    if (isServiceError(result)) return sendServiceError(res, result);
    res.json(result);
  }),
);

router.delete(
  "/signature-requests/:id",
  requireAuth,
  handle(async (req, res) => {
    const result = await cancelSignatureRequest({ actor: actorOf(req), requestId: String(req.params.id) });
    if (isServiceError(result)) return sendServiceError(res, result);
    res.json(result);
  }),
);

router.get(
  "/signature-requests/:id/documents/:kind",
  requireAuth,
  exportRateLimit,
  handle(async (req, res) => {
    const { userId } = req as AuthenticatedRequest;
    const kind = String(req.params.kind);
    if (kind !== "draft" && kind !== "signed" && kind !== "audit") {
      res.status(400).json({ error: "invalid_kind", message: "Use draft, signed or audit." });
      return;
    }
    const result =
      kind === "draft"
        ? await getDraftDocument(userId, String(req.params.id))
        : await getSignedDocument(userId, String(req.params.id), kind);
    if (isServiceError(result)) return sendServiceError(res, result);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", attachment(result.filename));
    res.setHeader("Cache-Control", "private, no-store");
    res.send(result.buffer);
  }),
);

const fileBody = z.object({ destination: z.string().trim().min(1).max(200) });

router.post(
  "/signature-requests/:id/storage",
  requireAuth,
  exportRateLimit,
  validateBody(fileBody),
  handle(async (req, res) => {
    const { destination } = req.body as z.infer<typeof fileBody>;
    const result = await fileSignedDocuments({
      actor: actorOf(req),
      requestId: String(req.params.id),
      destination,
    });
    if (isServiceError(result)) return sendServiceError(res, { provider: "google_drive", ...result });
    res.status(201).json(result);
  }),
);

// ---- DocuSeal webhook ---------------------------------------------------

// Raw body: the HMAC is over the exact bytes. app.ts skips the JSON parser
// for this path.
router.post(
  "/integrations/docuseal/webhook/:integrationId",
  express.raw({ type: "*/*", limit: "1mb" }),
  handle(async (req, res) => {
    const result = await handleDocuSealWebhook({
      integrationId: String(req.params.integrationId),
      token: typeof req.query.token === "string" ? req.query.token : undefined,
      rawBody: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
      signatureHeader: req.header("x-docuseal-signature") ?? undefined,
    });
    // Events for requests we didn't make come back ok (synced: null), so
    // DocuSeal doesn't retry them.
    if (isServiceError(result)) {
      res.status(ERRORS[result.error]?.status ?? 400).json({ error: result.error });
      return;
    }
    res.json(result);
  }),
);

export default router;
