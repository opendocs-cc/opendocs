/**
 * Owner notifications over Telegram: a private bot tells the person who runs
 * OpenDocs when someone signs up or starts paying, and answers a few commands.
 *
 * Only TELEGRAM_OWNER_ID is ever messaged, and the bot's webhook
 * (apps/api/src/routes/telegram.ts) ignores everyone else. Everything here is
 * best-effort: without TELEGRAM_BOT_TOKEN and TELEGRAM_OWNER_ID it does
 * nothing, and a Telegram error is logged, never thrown, so a signup or a
 * billing webhook can't fail because of it. The token is part of every API
 * URL, so nothing here logs a URL.
 */
import { and, count, eq, gte, inArray } from "drizzle-orm";

import { db } from "../db";
import { subscriptions, user } from "../db/schema";
import { currentBillingEnvironment } from "../billing/environment";

const TELEGRAM_API = "https://api.telegram.org";
const TIMEOUT_MS = 5_000;

function settings() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const ownerId = process.env.TELEGRAM_OWNER_ID?.trim();
  return token && ownerId ? { token, ownerId } : null;
}

/** The Telegram user the bot answers and notifies, or null when the bot is off. */
export function telegramOwnerId(): string | null {
  return settings()?.ownerId ?? null;
}

/** Escapes text for Telegram's HTML parse mode. */
export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type TelegramResponse = { ok: boolean; description?: string };

async function callTelegram(method: string, body: Record<string, unknown>): Promise<TelegramResponse> {
  const config = settings();
  if (!config) return { ok: false, description: "Telegram isn't configured" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${config.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Partial<TelegramResponse>;
    return { ok: res.ok && data.ok === true, description: data.description };
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : "request failed" };
  } finally {
    clearTimeout(timeout);
  }
}

/** Sends an HTML-formatted message to the owner. Returns whether Telegram took it. */
export async function sendOwnerMessage(html: string): Promise<boolean> {
  const config = settings();
  if (!config) return false;
  const res = await callTelegram("sendMessage", {
    chat_id: config.ownerId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  if (!res.ok) console.warn(`[telegram] sendMessage failed: ${res.description ?? "unknown error"}`);
  return res.ok;
}

const lines = (...parts: Array<string | null | undefined | false>) =>
  parts.filter(Boolean).join("\n");

export async function notifySignup(input: {
  email: string;
  name?: string | null;
  /** How the account was made, e.g. "an emailed code" or "Google". */
  method?: string | null;
}): Promise<void> {
  if (!settings()) return;
  let total: number | null = null;
  try {
    total = db ? ((await db.select({ value: count() }).from(user))[0]?.value ?? null) : null;
  } catch {
    // The count is a nicety; the notification goes out without it.
  }
  const name = input.name?.trim();
  await sendOwnerMessage(
    lines(
      "<b>New signup</b>",
      name && name !== input.email ? escapeTelegramHtml(name) : null,
      escapeTelegramHtml(input.email),
      input.method ? `Signed up with ${escapeTelegramHtml(input.method)}` : null,
      total !== null ? `${total} accounts in total` : null,
    ),
  );
}

const PLAN_NAMES = { pro: "Pro", team: "Team" } as const;

export async function notifyNewSubscriber(input: {
  email: string;
  plan?: "pro" | "team";
  cycle?: "monthly" | "yearly";
  seats?: number;
  /** In the currency's main unit (dollars, not cents). */
  amount?: number;
  currency?: string;
}): Promise<void> {
  if (!settings()) return;
  const sandbox = currentBillingEnvironment() === "sandbox";
  const plan = [
    input.plan ? PLAN_NAMES[input.plan] : "A paid plan",
    input.cycle,
    input.plan === "team" && input.seats ? `${input.seats} seats` : null,
  ]
    .filter(Boolean)
    .join(", ");
  let price: string | null = null;
  if (input.amount !== undefined && input.currency) {
    try {
      price = new Intl.NumberFormat("en-US", { style: "currency", currency: input.currency }).format(input.amount);
    } catch {
      price = `${input.amount} ${input.currency}`;
    }
  }
  await sendOwnerMessage(
    lines(
      `<b>New paying customer</b>${sandbox ? " (sandbox)" : ""}`,
      escapeTelegramHtml(input.email),
      price ? `${escapeTelegramHtml(plan)}: ${escapeTelegramHtml(price)}` : escapeTelegramHtml(plan),
    ),
  );
}

/**
 * A reader reported an anonymous page (/a/<id>). Sent for the first report
 * and again when reports hide the page, not for every report, so a page
 * reported by many people doesn't flood the chat. The title and details are
 * the author's and reporter's words, so they're escaped.
 */
export async function notifyAnonymousDocReport(input: {
  id: string;
  title: string;
  url: string;
  /** Readable reason, e.g. "Phishing or a scam". */
  reason: string;
  details?: string | null;
  reports: number;
  hideAfter: number;
  newlyHidden: boolean;
}): Promise<void> {
  if (!settings()) return;
  const details = input.details?.trim();
  const id = escapeTelegramHtml(input.id);
  await sendOwnerMessage(
    lines(
      input.newlyHidden
        ? `<b>Anonymous page hidden</b> after ${input.reports} reports`
        : "<b>Anonymous page reported</b>",
      escapeTelegramHtml(input.title),
      escapeTelegramHtml(input.url),
      `Reason: ${escapeTelegramHtml(input.reason)}`,
      details ? `"${escapeTelegramHtml(details.slice(0, 500))}"` : null,
      input.newlyHidden
        ? `It shows "hidden pending review" now. /restore ${id} shows it again, /remove ${id} deletes it.`
        : `It's hidden after ${input.hideAfter} reports from different addresses. /remove ${id} deletes it now.`,
    ),
  );
}

/** Signups and paying subscriptions, for the bot's /stats command. */
export async function ownerStatsMessage(now = new Date()): Promise<string> {
  if (!db) return "The database isn't available.";
  const day = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const accountsSince = async (since?: Date) =>
    (await db!.select({ value: count() }).from(user).where(since ? gte(user.createdAt, since) : undefined))[0]
      ?.value ?? 0;
  const [total, today, week, month, paying] = await Promise.all([
    accountsSince(),
    accountsSince(startOfToday),
    accountsSince(new Date(now.getTime() - 7 * day)),
    accountsSince(new Date(now.getTime() - 30 * day)),
    db
      .select({ plan: subscriptions.plan, value: count() })
      .from(subscriptions)
      .where(
        and(
          inArray(subscriptions.status, ["active", "trialing", "past_due"]),
          eq(subscriptions.environment, currentBillingEnvironment()),
        ),
      )
      .groupBy(subscriptions.plan),
  ]);
  const byPlan = new Map(paying.map((row) => [row.plan, row.value]));
  const pro = byPlan.get("pro") ?? 0;
  const team = byPlan.get("team") ?? 0;
  return lines(
    "<b>Accounts</b>",
    `${today} today, ${week} in 7 days, ${month} in 30 days`,
    `${total} in total`,
    "",
    "<b>Paying subscriptions</b>",
    `${pro + team} (${pro} Pro, ${team} Team)`,
  );
}

/**
 * Points the bot at this API's webhook and shows its commands only in the
 * owner's chat. Runs at startup in production only: an API running locally
 * with the same token would otherwise take the bot over.
 */
export async function registerTelegramWebhook(apiUrl: string | undefined): Promise<void> {
  const config = settings();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!config || !secret || process.env.NODE_ENV !== "production" || !apiUrl?.startsWith("https://")) return;
  const hook = await callTelegram("setWebhook", {
    url: `${apiUrl.replace(/\/$/, "")}/api/v1/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message"],
  });
  if (!hook.ok) {
    console.warn(`[telegram] setWebhook failed: ${hook.description ?? "unknown error"}`);
    return;
  }
  await callTelegram("setMyCommands", {
    commands: [
      { command: "stats", description: "Signups and paying customers" },
      { command: "remove", description: "Delete a reported anonymous page: /remove <id>" },
      { command: "restore", description: "Show a hidden anonymous page again: /restore <id>" },
    ],
    scope: { type: "chat", chat_id: Number(config.ownerId) },
  });
  console.log("[telegram] Webhook registered.");
}
