import { Router, type Response } from "express";
import { z } from "zod";

import { ANONYMOUS_REPORT_REASONS, FREE_TOOL_LIMITS } from "@opendocs/shared/config/free-tools";
import { hideAfterDistinctReporters } from "@opendocs/shared/config/free-tools-env";
import { siteConfig } from "@opendocs/shared/config/site";
import {
  AnonymousDocError,
  anonymousPublishInputSchema,
  anonymousUpdateInputSchema,
  claimAnonymousInputSchema,
  claimAnonymousDoc,
  createAnonymousDoc,
  getAnonymousDocForExport,
  reportAnonymousDoc,
  reportAnonymousDocInputSchema,
  updateAnonymousDoc,
} from "@opendocs/shared/anonymous/service";
import { notifyAnonymousDocReport } from "@opendocs/shared/notifications/telegram";
import { PlanLimitError } from "@opendocs/shared/posts/service";
import { requireAuth } from "../auth/middleware";
import { attachmentHeader, convertMarkdown } from "../lib/converter";
import { publicBranding } from "../lib/public-branding";
import { rejectBotSubmissions } from "../middleware/bot-check";
import { readClient } from "../middleware/client";
import {
  anonymousPublishDailyRateLimit,
  anonymousPublishGlobalDailyLimit,
  anonymousPublishGlobalHourlyLimit,
  anonymousPublishGlobalMinuteLimit,
  anonymousPublishRateLimit,
  anonymousReportDailyRateLimit,
  anonymousReportHourlyRateLimit,
  clientAddressKey,
  publicConvertBurstRateLimit,
  publicConvertDailyRateLimit,
  publicConvertGlobalHourlyLimit,
  publicConvertGlobalMinuteLimit,
  publicConvertHourlyRateLimit,
} from "../middleware/rate-limit";
import { validateBody } from "../middleware/validate";
import { withPublicUrl } from "../lib/public-url";
import type { AuthenticatedRequest } from "../types";

/**
 * Account-free publishing: the doc is readable by anyone with its
 * unguessable link for 24 hours, then deleted. The creator gets a claim
 * token to update it meanwhile and to keep it by claiming it into a
 * workspace (POST /anonymous/claim, authenticated).
 */

const router = Router();

function webUrl(path: string) {
  return `${process.env.WEB_APP_URL ?? siteConfig.url}${path}`;
}

function sendAnonymousError(res: Response, err: AnonymousDocError) {
  const status =
    err.code === "invalid_claim_token" || err.code === "hidden" ? 403 : err.code === "expired" ? 410 : 404;
  res.status(status).json({ error: err.code, message: err.message });
}

const SIGN_UP_HINT =
  "Anonymous documents expire in 24 hours. To keep it, sign up with `opendocs login --email <you@example.com>` and claim it with the claimUrl.";

// New documents: the global breakers first (only successful publishes count),
// then the per-IP hourly cap (shared with updates) and daily cap, then the
// tool page's bot checks. Numbers: FREE_TOOL_LIMITS.anonymousPublish.
router.post(
  "/anonymous/publish",
  anonymousPublishGlobalMinuteLimit,
  anonymousPublishGlobalHourlyLimit,
  anonymousPublishGlobalDailyLimit,
  anonymousPublishRateLimit,
  anonymousPublishDailyRateLimit,
  rejectBotSubmissions("anonymous/publish"),
  validateBody(anonymousPublishInputSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof anonymousPublishInputSchema>;
      const doc = await createAnonymousDoc({ ...body, client: readClient(req) });
      res.status(201).json({
        id: doc.id,
        title: doc.title,
        url: webUrl(doc.path),
        claimToken: doc.claimToken,
        claimUrl: webUrl(doc.claimPath),
        expiresAt: doc.expiresAt,
        anonymous: true,
        message: SIGN_UP_HINT,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/anonymous/:id",
  anonymousPublishRateLimit,
  validateBody(anonymousUpdateInputSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof anonymousUpdateInputSchema>;
      const doc = await updateAnonymousDoc(req.params.id as string, {
        ...body,
        client: readClient(req),
      });
      res.json({
        id: doc.id,
        title: doc.title,
        url: webUrl(doc.path),
        expiresAt: doc.expiresAt,
        anonymous: true,
      });
    } catch (err) {
      if (err instanceof AnonymousDocError) {
        sendAnonymousError(res, err);
        return;
      }
      next(err);
    }
  },
);

const ANONYMOUS_ID = /^[A-Za-z0-9_-]{16,64}$/;

// "Report this page" on /a/<id>. Answers 202 whether or not this reporter
// had reported it before, and whether or not it's hidden now, so the
// response doesn't tell anyone how close a page is to being hidden. The
// owner hears about the first report and about the page being hidden.
router.post(
  "/anonymous/:id/report",
  anonymousReportHourlyRateLimit,
  anonymousReportDailyRateLimit,
  rejectBotSubmissions("anonymous/report"),
  validateBody(reportAnonymousDocInputSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string;
      if (!ANONYMOUS_ID.test(id)) {
        res.status(404).json({ error: "not_found", message: "Anonymous document not found." });
        return;
      }
      const body = req.body as z.infer<typeof reportAnonymousDocInputSchema>;
      const report = await reportAnonymousDoc(id, { ...body, reporterKey: clientAddressKey(req.ip) });
      if (report.firstReport || report.newlyHidden) {
        void notifyAnonymousDocReport({
          id: report.id,
          title: report.title,
          url: webUrl(report.path),
          reason: ANONYMOUS_REPORT_REASONS[body.reason],
          details: body.details,
          reports: report.reports,
          hideAfter: hideAfterDistinctReporters(),
          newlyHidden: report.newlyHidden,
        }).catch((err) => console.warn("[anonymous] Report notification failed:", err));
      }
      res.status(202).json({
        reported: true,
        message: "Thanks. We'll take a look.",
      });
    } catch (err) {
      if (err instanceof AnonymousDocError) {
        sendAnonymousError(res, err);
        return;
      }
      next(err);
    }
  },
);

// GET /anonymous/:id/export/pdf: the "Download PDF" on /a/<id> pages and in
// the browser extension. Anyone with the link can read the doc, so anyone
// with it can download it; the free converter's limits apply (same buckets
// as the tool pages), and the footer link says what made the file.
router.get(
  "/anonymous/:id/export/pdf",
  publicConvertGlobalMinuteLimit,
  publicConvertGlobalHourlyLimit,
  publicConvertBurstRateLimit,
  publicConvertHourlyRateLimit,
  publicConvertDailyRateLimit,
  async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const doc = ANONYMOUS_ID.test(id) ? await getAnonymousDocForExport(id) : null;
      if (!doc) {
        res.status(404).json({ error: "not_found", message: "This document has expired or doesn't exist." });
        return;
      }
      const madeBy = doc.client?.startsWith("opendocs-extension") ? "extension" : "anonymous";
      const result = await convertMarkdown("pdf", {
        markdown: doc.markdown,
        filename: doc.title || "document",
        ...publicBranding(madeBy),
      });
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Disposition", attachmentHeader(result.filename));
      res.setHeader("Content-Length", result.buffer.length.toString());
      res.setHeader("Cache-Control", "no-store");
      res.send(result.buffer);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/anonymous/claim",
  requireAuth,
  validateBody(claimAnonymousInputSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const body = req.body as z.infer<typeof claimAnonymousInputSchema>;
      const post = await claimAnonymousDoc(userId, body, { client: readClient(req) });
      res.status(201).json(await withPublicUrl(post.postId, post));
    } catch (err) {
      if (err instanceof AnonymousDocError) {
        sendAnonymousError(res, err);
        return;
      }
      if (err instanceof PlanLimitError) {
        res.status(403).json({
          error: err.code,
          plan: err.plan,
          limit: err.limit,
          used: err.used,
          message: `Your ${err.plan} plan allows ${err.limit} published documents. You currently have ${err.used}.`,
        });
        return;
      }
      if (err instanceof Error && /not found/i.test(err.message)) {
        res.status(404).json({ error: "not_found", message: err.message });
        return;
      }
      next(err);
    }
  },
);

export default router;
