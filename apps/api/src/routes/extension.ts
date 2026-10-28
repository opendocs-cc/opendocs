import { Router } from "express";
import { z } from "zod";

import { EXTENSION_SITES } from "@opendocs/shared/extension/config";
import { escapeTelegramHtml, sendOwnerMessage } from "@opendocs/shared/notifications/telegram";
import { clientAddressKey, extensionEventsRateLimit, extensionFeedbackRateLimit } from "../middleware/rate-limit";
import { validateBody } from "../middleware/validate";

/**
 * Endpoints for the OpenDocs browser extension (opendocs-cc/opendocs-extension)
 * that aren't publishing:
 *
 *   - POST /extension/events: a failure ping when the extension can't find a
 *     chat site's answers or read a chat. It carries no content: the site,
 *     the step that failed, an error code and the versions. When several
 *     people hit the same site within an hour, the owner gets a Telegram
 *     message, so a chat site's redesign is noticed before the reviews are.
 *   - POST /extension/feedback: the optional answer on /extension/uninstalled.
 */

const router = Router();

const eventBody = z.object({
  site: z.enum([...EXTENSION_SITES, "other"]),
  stage: z.enum(["detect", "anchors", "extract-api", "extract-dom", "publish", "signin"]),
  code: z.string().trim().regex(/^[a-z0-9_.:-]{1,64}$/i),
  version: z.string().trim().regex(/^[0-9a-z.+-]{1,32}$/i),
  extractor: z.string().trim().regex(/^[0-9a-z._-]{1,32}$/i).optional(),
});

/** People (addresses) hitting the same site within the window before we alert. */
export const EXTENSION_ALERT = {
  windowMs: 60 * 60 * 1000,
  distinctAddresses: 5,
  quietMs: 6 * 60 * 60 * 1000,
};

type SiteWindow = { startedAt: number; addresses: Set<string>; stages: Map<string, number> };
const windows = new Map<string, SiteWindow>();
const lastAlertAt = new Map<string, number>();

/** Counts a failure; returns the window when it should alert (tests read it too). */
export function recordExtensionFailure(site: string, stage: string, code: string, address: string, now = Date.now()) {
  let window = windows.get(site);
  if (!window || now - window.startedAt >= EXTENSION_ALERT.windowMs) {
    window = { startedAt: now, addresses: new Set(), stages: new Map() };
    windows.set(site, window);
  }
  window.addresses.add(address);
  const key = `${stage}:${code}`;
  window.stages.set(key, (window.stages.get(key) ?? 0) + 1);

  const quiet = now - (lastAlertAt.get(site) ?? 0) < EXTENSION_ALERT.quietMs;
  if (window.addresses.size < EXTENSION_ALERT.distinctAddresses || quiet) return null;
  lastAlertAt.set(site, now);
  return window;
}

export function resetExtensionFailures() {
  windows.clear();
  lastAlertAt.clear();
}

router.post("/extension/events", extensionEventsRateLimit, validateBody(eventBody), (req, res) => {
  const event = req.body as z.infer<typeof eventBody>;
  console.warn(
    `[extension] ${event.site} failed at ${event.stage} (${event.code}), extension ${event.version}${event.extractor ? `, reader ${event.extractor}` : ""}`,
  );
  const window = recordExtensionFailure(event.site, event.stage, event.code, clientAddressKey(req.ip));
  if (window) {
    const top = [...window.stages.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key, count]) => `${escapeTelegramHtml(key)} ×${count}`)
      .join(", ");
    void sendOwnerMessage(
      `⚠️ <b>Browser extension:</b> ${escapeTelegramHtml(event.site)} is failing for ${window.addresses.size} people in the last hour (${top}). Extension ${escapeTelegramHtml(event.version)}.`,
    );
  }
  res.status(204).end();
});

const UNINSTALL_REASONS = {
  broken: "It didn't work on a chat site",
  formatting: "The document or PDF didn't look right",
  privacy: "Privacy worries",
  not_needed: "I don't need it",
  other: "Something else",
} as const;

const feedbackBody = z.object({
  reason: z.enum(Object.keys(UNINSTALL_REASONS) as [keyof typeof UNINSTALL_REASONS, ...Array<keyof typeof UNINSTALL_REASONS>]),
  details: z.string().trim().max(500).optional(),
});

router.post("/extension/feedback", extensionFeedbackRateLimit, validateBody(feedbackBody), (req, res) => {
  const { reason, details } = req.body as z.infer<typeof feedbackBody>;
  void sendOwnerMessage(
    `👋 <b>Extension removed:</b> ${escapeTelegramHtml(UNINSTALL_REASONS[reason])}${details ? `\n“${escapeTelegramHtml(details)}”` : ""}`,
  );
  res.status(202).json({ received: true, message: "Thanks for telling us." });
});

export default router;
