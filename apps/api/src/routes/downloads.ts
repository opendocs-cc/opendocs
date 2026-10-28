import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";

import { createDownloadLink, redeemDownloadLink } from "@opendocs/shared/downloads/service";
import {
  getDraftDocument,
  getSignatureRequest,
  getSignedDocument,
} from "@opendocs/shared/integrations/signatures";
import { isServiceError } from "@opendocs/shared/integrations/service";

import { requireAuth } from "../auth/middleware";
import { converterFailure } from "../lib/converter";
import { findAccessiblePost } from "../lib/post-lookup";
import { clientIpKey, exportConcurrencyLimit, exportRateLimit } from "../middleware/rate-limit";
import { validateBody } from "../middleware/validate";
import type { AuthenticatedRequest } from "../types";
import { DOCX_REQUIRES_PRO, exportBodySchema, exportPostForUser, isPaidWorkspace } from "./posts";

/**
 * Download links: chat apps using the MCP server can't receive file
 * bytes, so `export_document` and the signature tools ask for a link
 * instead. POST /download-links checks access and returns a URL valid
 * for an hour; opening it renders the file as the user who asked.
 */

const router = Router();

const linkBody = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("post_export"),
    document: z.string().trim().min(1).max(200),
    workspaceId: z.string().optional(),
    projectId: z.string().optional(),
    format: z.enum(["pdf", "docx"]),
    landscape: z.boolean().optional(),
    accent_color: z.string().regex(/^#?[0-9A-Fa-f]{6}$/).optional(),
    filename: z.string().trim().min(1).max(120).optional(),
  }),
  z.object({
    kind: z.literal("signature_document"),
    requestId: z.string().trim().min(1).max(100),
    document: z.enum(["draft", "signed", "audit"]),
  }),
]);

function publicApiUrl(): string {
  return (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
}

function attachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]+/g, "-").replace(/["\\]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

router.post("/download-links", requireAuth, exportRateLimit, validateBody(linkBody), async (req, res, next) => {
  try {
    const { userId, authMethod, oauth } = req as AuthenticatedRequest;
    const body = req.body as z.infer<typeof linkBody>;

    // Signature PDFs belong to the e-signature permission, not just reading.
    if (body.kind === "signature_document" && authMethod === "oauth" && !oauth?.scopes.has("integrations")) {
      res.status(403).json({
        error: "insufficient_scope",
        scope: "integrations",
        message: "This connection doesn't have the Google Drive and e-signatures permission.",
      });
      return;
    }

    let filename: string;
    let payload: Record<string, unknown>;
    if (body.kind === "post_export") {
      const post = await findAccessiblePost(userId, body.document, body.workspaceId, body.projectId);
      if (!post) {
        res.status(404).json({
          error: "not_found",
          message: "Document not found, or you can't read it. Use list_documents to find it.",
        });
        return;
      }
      if (body.format === "docx" && !(await isPaidWorkspace(post.workspaceId))) {
        res.status(403).json(DOCX_REQUIRES_PRO);
        return;
      }
      filename = `${body.filename ?? post.slug}.${body.format}`;
      payload = {
        postId: post.id,
        format: body.format,
        landscape: body.landscape,
        accent_color: body.accent_color,
        filename: body.filename,
      };
    } else {
      const request = await getSignatureRequest(userId, body.requestId);
      if (isServiceError(request)) {
        res.status(request.error === "not_found" ? 404 : 403).json(request);
        return;
      }
      if (body.document !== "draft" && request.status !== "completed") {
        res.status(409).json({
          error: "not_completed",
          status: request.status,
          message: "The signed PDF and audit log are ready once everyone has signed.",
        });
        return;
      }
      if (body.document === "draft" && request.status !== "draft") {
        res.status(409).json({
          error: "not_available",
          message: "The draft PDF is only kept until the request is sent.",
        });
        return;
      }
      const base = (request.document?.title ?? "document").replace(/[\\/:*?"<>|]+/g, "-");
      filename = `${base}${body.document === "draft" ? "" : ` (${body.document})`}.pdf`;
      payload = { requestId: body.requestId, document: body.document };
    }

    const link = await createDownloadLink({ userId, kind: body.kind, payload, filename });
    res.status(201).json({
      url: `${publicApiUrl()}/api/v1/downloads/${link.token}`,
      filename,
      expiresAt: link.expiresAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

const downloadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: clientIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test" && process.env.OPENDOCS_TEST_RATE_LIMITS !== "true",
  message: "Too many downloads. Try again in a minute.",
});

function sendPlainError(res: Response, status: number, message: string) {
  res.status(status).type("text/plain; charset=utf-8").send(message);
}

type RedeemedLink = NonNullable<Awaited<ReturnType<typeof redeemDownloadLink>>>;

/**
 * Looks the link up and acts as its owner from here on, so the export rate
 * and concurrency limits below count against that account.
 */
async function resolveLink(req: Request, res: Response, next: NextFunction) {
  try {
    const link = await redeemDownloadLink(String(req.params.token));
    if (!link) {
      sendPlainError(
        res,
        410,
        "This download link has expired. Ask the app for a new one (links last an hour).",
      );
      return;
    }
    (req as AuthenticatedRequest).userId = link.userId;
    res.locals.downloadLink = link;
    next();
  } catch (err) {
    next(err);
  }
}

router.get("/downloads/:token", downloadRateLimit, resolveLink, exportRateLimit, exportConcurrencyLimit, async (_req, res, next) => {
  try {
    const link = res.locals.downloadLink as RedeemedLink;

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Robots-Tag", "noindex");

    if (link.kind === "post_export") {
      const payload = link.payload as {
        postId: string;
        format: "pdf" | "docx";
        landscape?: boolean;
        accent_color?: string;
        filename?: string;
      };
      try {
        const result = await exportPostForUser({
          userId: link.userId,
          postIdOrSlug: payload.postId,
          workspaceId: undefined,
          projectId: undefined,
          format: payload.format,
          body: exportBodySchema.parse({
            landscape: payload.landscape,
            accent_color: payload.accent_color,
            filename: payload.filename,
          }),
        });
        if (!result.ok) {
          const message =
            typeof result.body.message === "string" ? result.body.message : "This document is no longer available.";
          sendPlainError(res, result.status, message);
          return;
        }
        res.setHeader("Content-Type", result.contentType);
        res.setHeader("Content-Disposition", attachment(link.filename));
        res.send(result.buffer);
      } catch (err) {
        const failure = converterFailure(err);
        if (failure) {
          sendPlainError(res, failure.status, "The document converter is busy. Open the link again in a moment.");
          return;
        }
        throw err;
      }
      return;
    }

    if (link.kind === "signature_document") {
      const payload = link.payload as { requestId: string; document: "draft" | "signed" | "audit" };
      const result =
        payload.document === "draft"
          ? await getDraftDocument(link.userId, payload.requestId)
          : await getSignedDocument(link.userId, payload.requestId, payload.document);
      if (isServiceError(result)) {
        sendPlainError(
          res,
          409,
          typeof result.message === "string" ? result.message : "This file is no longer available.",
        );
        return;
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", attachment(link.filename));
      res.send(result.buffer);
      return;
    }

    sendPlainError(res, 404, "Unknown download.");
  } catch (err) {
    next(err);
  }
});

export default router;
