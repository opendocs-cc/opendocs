import type { NextFunction, Request, Response } from "express";

import { FREE_TOOL_LIMITS } from "@opendocs/shared/config/free-tools";

/**
 * Cheap checks against bots that drive the tool pages' forms
 * (FREE_TOOL_LIMITS.botCheck):
 *
 * - The honeypot: a field the pages hide from people. Any value means a bot
 *   filled in every input it found.
 * - Time to submit: the pages send how long the form was on screen. Faster
 *   than a person can click means a script.
 *
 * Both only apply when the fields are sent, so the API and the CLI, which
 * never send them, are unaffected. A rejected request gets a generic 400 that
 * doesn't say which check failed; a person who trips the timing check by
 * clicking very fast just tries again. Mount after the body is parsed (after
 * multer for multipart routes), and after the rate limiters, so rejected
 * requests still count against the sender.
 */
export function rejectBotSubmissions(route: string) {
  const { honeypotField, elapsedField, minElapsedMs } = FREE_TOOL_LIMITS.botCheck;
  return (req: Request, res: Response, next: NextFunction) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const honeypot = body[honeypotField];
    const elapsedRaw = body[elapsedField];
    const elapsed =
      typeof elapsedRaw === "number" ? elapsedRaw : typeof elapsedRaw === "string" ? Number(elapsedRaw) : null;

    const filledHoneypot = typeof honeypot === "string" ? honeypot.trim().length > 0 : honeypot != null;
    const tooFast = elapsed !== null && (!Number.isFinite(elapsed) || elapsed < minElapsedMs);
    if (filledHoneypot || tooFast) {
      console.warn(`[bot-check] Rejected ${route}: ${filledHoneypot ? "honeypot" : "too fast"}`);
      res.status(400).json({
        error: "invalid_request",
        message: "We couldn't accept that. Wait a moment and try again.",
      });
      return;
    }
    next();
  };
}
