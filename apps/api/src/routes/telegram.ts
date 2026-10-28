import { timingSafeEqual } from "node:crypto";
import { Router } from "express";

import { removeAnonymousDoc, restoreAnonymousDoc } from "@opendocs/shared/anonymous/service";
import {
  escapeTelegramHtml,
  ownerStatsMessage,
  telegramOwnerId,
} from "@opendocs/shared/notifications/telegram";

const router = Router();

function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const HELP = [
  "This bot tells you when someone signs up for OpenDocs or starts paying, and when readers report an anonymous page.",
  "",
  "/stats: signups and paying customers",
  "/remove <id>: delete a reported anonymous page",
  "/restore <id>: show a hidden anonymous page again",
].join("\n");

const ANONYMOUS_ID = /^[A-Za-z0-9_-]{16,64}$/;

// The owner's review of a reported anonymous page (see
// notifyAnonymousDocReport): /remove deletes it, /restore unhides it and
// clears its reports.
async function reviewCommand(command: "/remove" | "/restore", id: string | undefined) {
  if (!id || !ANONYMOUS_ID.test(id)) return `Send ${command} followed by the page id, e.g. ${command} AbC123...`;
  const done = command === "/remove" ? await removeAnonymousDoc(id) : await restoreAnonymousDoc(id);
  const safeId = escapeTelegramHtml(id);
  if (!done) return `No anonymous page ${safeId}. It may have expired or been removed already.`;
  return command === "/remove" ? `Removed ${safeId}.` : `Restored ${safeId}. Its reports are cleared.`;
}

type TelegramUpdate = {
  message?: {
    text?: string;
    from?: { id?: number };
    chat?: { id?: number; type?: string };
  };
};

// Telegram calls this with every message sent to the bot (registered at
// startup by registerTelegramWebhook). Only the owner, in their private
// chat with the bot, gets an answer; anyone else is acknowledged and
// ignored, so the bot doesn't reveal anything to strangers.
router.post("/telegram/webhook", async (req, res, next) => {
  try {
    const ownerId = telegramOwnerId();
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!ownerId || !secret) {
      res.status(404).json({ error: "not_found", message: "Not found." });
      return;
    }
    if (!sameSecret(req.header("x-telegram-bot-api-secret-token") ?? "", secret)) {
      res.status(401).json({ error: "unauthorized", message: "Missing or invalid secret token." });
      return;
    }

    const message = (req.body as TelegramUpdate | undefined)?.message;
    const fromOwner =
      String(message?.from?.id) === ownerId &&
      String(message?.chat?.id) === ownerId &&
      message?.chat?.type === "private";
    if (!fromOwner || typeof message?.text !== "string") {
      res.sendStatus(200);
      return;
    }

    const [rawCommand, argument] = message.text.trim().split(/\s+/);
    const command = rawCommand?.split("@")[0]?.toLowerCase();
    const text =
      command === "/stats"
        ? await ownerStatsMessage()
        : command === "/remove" || command === "/restore"
          ? await reviewCommand(command, argument)
          : HELP;
    // Answering in the webhook response saves a call to Telegram.
    res.json({ method: "sendMessage", chat_id: ownerId, text, parse_mode: "HTML" });
  } catch (err) {
    next(err);
  }
});

export default router;
