import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { Request, RequestHandler } from "express";
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";

import { FREE_TOOL_LIMITS } from "@opendocs/shared/config/free-tools";
import { anonymousPublishGlobalLimits, converterGlobalLimits } from "@opendocs/shared/config/free-tools-env";
import type { AuthenticatedRequest } from "../types";

// Every limiter here keeps its counters in express-rate-limit's default
// MemoryStore, inside this process. That's right for production today (one
// API instance, deploy/docker-compose.yml); a restart resets the counters,
// and a second instance would need a shared store (e.g. Redis) or each would
// allow the full limit.

// Limiters are skipped under test so endpoint suites don't trip them, unless
// a suite opts in with OPENDOCS_TEST_RATE_LIMITS=true to exercise them. The
// check runs per request so a suite can flip it after the app is created.
function shouldSkipRateLimit() {
  return process.env.NODE_ENV === "test" && process.env.OPENDOCS_TEST_RATE_LIMITS !== "true";
}

function createRateLimiter(options: Parameters<typeof rateLimit>[0]): RateLimitRequestHandler {
  return rateLimit({ ...options, skip: shouldSkipRateLimit });
}

/**
 * Number of reverse-proxy hops in front of the API whose X-Forwarded-For
 * entries we trust. Production runs behind a single Caddy (deploy/Caddyfile)
 * that overwrites X-Forwarded-For with the real client address, so the
 * default is 1. Without this, `req.ip` is Caddy's container address and every
 * IP-keyed limiter collapses into one bucket shared by all users. Set
 * TRUST_PROXY_HOPS=0 if the API is ever exposed without a proxy, otherwise
 * clients could spoof their IP via the header.
 *
 * Why 1 is right behind Caddy: Caddy only keeps an incoming X-Forwarded-For
 * from proxies listed in its `trusted_proxies` (none are), so the header the
 * API sees holds exactly one address, the one Caddy accepted the connection
 * from. Anything a client puts in the header itself is dropped, and with one
 * trusted hop Express takes the right-most entry anyway. The API container
 * publishes no port, so nothing reaches it except through Caddy.
 *
 * If Cloudflare's proxy (orange cloud) is ever turned on, Caddy would see
 * Cloudflare's addresses: list Cloudflare's ranges in Caddy's
 * `trusted_proxies` and set TRUST_PROXY_HOPS=2, or every visitor behind one
 * Cloudflare edge shares a bucket.
 */
export function getTrustProxyHops() {
  const raw = process.env.TRUST_PROXY_HOPS;
  if (raw === undefined || raw.trim() === "") return 1;
  const hops = Number(raw);
  return Number.isInteger(hops) && hops >= 0 ? hops : 1;
}

/**
 * The bucket a client address falls in. IPv4 addresses (and IPv4-mapped
 * IPv6 ones) as they are; IPv6 by its /56 prefix, because one subscriber
 * usually gets a /64 or a /56 and could otherwise rotate through 2^64
 * addresses to get a fresh bucket for every request. (express-rate-limit 8
 * does the same by default; we're on 7.)
 */
export function clientAddressKey(ip: string | undefined): string {
  if (!ip) return "unknown";
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  if (isIP(ip) !== 6) return ip;
  const groups = expandIpv6(ip);
  if (!groups) return ip;
  const prefix = [groups[0], groups[1], groups[2], groups[3] & 0xff00].map((g) => g.toString(16));
  return `${prefix.join(":")}::/56`;
}

function expandIpv6(ip: string): number[] | null {
  const halves = ip.split("%")[0].split("::");
  if (halves.length > 2) return null;
  const split = (part: string) => (part ? part.split(":") : []);
  const head = split(halves[0]);
  const tail = halves.length === 2 ? split(halves[1]) : [];
  // A trailing dotted IPv4 part (e.g. 64:ff9b::192.0.2.1) is two groups.
  const last = tail.length > 0 ? tail : head;
  const dotted = last[last.length - 1];
  if (dotted?.includes(".")) {
    const octets = dotted.split(".").map(Number);
    last.splice(-1, 1, ((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16));
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail].map((g) => parseInt(g, 16));
  return groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/**
 * The key for every per-address limit. Every limiter in the API keys on
 * this (directly or as the fallback for signed-out callers) rather than
 * express-rate-limit's default raw `req.ip`, so an IPv6 client can't dodge
 * a limit by rotating addresses inside its /64.
 */
export function clientIpKey(req: Request): string {
  return `ip:${clientAddressKey(req.ip)}`;
}

const ipKey = clientIpKey;

// Signed-in routes are limited per account, not per IP, so a team behind one
// office address doesn't share a bucket. Mount these limiters after the auth
// middleware; before it, every caller falls back to its address.
function accountOrIpKey(req: Request): string {
  const userId = (req as AuthenticatedRequest).userId;
  return userId ? `user:${userId}` : ipKey(req);
}

// Public downloads: readers signed in on a custom domain arrive through the
// web app's download route (one server address), so they're counted per
// reader; everyone else per address.
function readerOrIpKey(req: Request): string {
  const viewer = (req as Request & { customDomainViewer?: { userId: string } }).customDomainViewer;
  return viewer ? `viewer:${viewer.userId}` : ipKey(req);
}

// Applied to POSTs under /api/auth (sign-in, sign-up, password reset…) on top
// of generalRateLimit, to slow credential stuffing and signup spam.
export const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  keyGenerator: ipKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many requests. Try again later." },
});

// The per-account limits below are sized for real workflows, not for the
// average request: an agent republishing and re-exporting a folder of 50+
// long documents after a round of edits must go through in one run. They
// exist to stop runaway scripts. Fairness on the converter comes from
// exportConcurrencyLimit, and the CLI waits out a 429 (Retry-After) and
// retries, so hitting a limit slows a big job down instead of failing it.
export const publishRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  keyGenerator: accountOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many publish requests. Try again later." },
});

// Each batch carries up to 25 documents, so 20 batches = 500 docs a minute.
// The server still processes each batch sequentially.
export const batchPublishRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: accountOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many batch publish requests. Try again later." },
});

// Signed-in single exports (CLI, API, dashboard).
export const exportRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: accountOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many export requests. Try again later." },
});

// Each batch converts up to 10 documents, so 30 batches = 300 docs a minute,
// more than one converter worker gets through. The CLI sends batches one
// after another, which also keeps it under exportConcurrencyLimit.
export const batchExportRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: accountOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many batch export requests. Try again later." },
});

// "Check now" on a custom domain. Each check is a handful of DNS lookups
// against public resolvers; the dashboard also polls while a domain is
// pending, so leave room for that.
export const domainCheckRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 12,
  keyGenerator: accountOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many domain checks. Wait a minute and try again." },
});

// PDF/DOCX downloads by readers of a public document, keyed by IP since the
// reader may not be signed in. Results come from the export cache after the
// first download, so this mostly guards against scraping.
export const publicExportRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: readerOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many export requests. Try again later." },
});

// Raw Markdown of a public document: a single database read, and how agents
// read published docs, so it gets the same room as the general bucket.
export const publicRawRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: readerOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many requests. Try again later." },
});

// A public workspace's "download all as Markdown" zip (up to 200 posts).
export const workspaceZipRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 3,
  keyGenerator: readerOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many downloads. Try again later." },
});

function isPrivateAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\./i.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return ip === "::1" || /^f[cd][0-9a-f]{2}:/i.test(ip);
}

/**
 * The general limiter's bucket. Requests from inside the deployment (the
 * MCP service at mcp.opendocs.cc calls the API over the private network)
 * carry many users' requests from one address, and their users' own
 * addresses are shared too (every Claude user reaches MCP from Anthropic's
 * few egress IPs), so those are counted per bearer credential instead.
 * Outside callers can't arrive with a private address: Caddy sets the
 * forwarded address to the real client.
 */
function generalKey(req: Request): string {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ") && isPrivateAddress(req.ip)) {
    return `cred:${createHash("sha256").update(authorization).digest("hex").slice(0, 32)}`;
  }
  return ipKey(req);
}

// Per-IP ceiling on all API traffic, ahead of auth. A backstop against
// floods, set high enough that an office or an agent working through a big
// folder never notices it.
export const generalRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 600,
  keyGenerator: generalKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many requests. Try again later." },
});

/**
 * Caps how many export requests one account can have running at once. Each
 * export ties up the converter, and with the per-minute limits this generous,
 * parallel requests are what could fill its queue and make everyone else's
 * exports wait. Over the cap the caller gets a 429 with a short Retry-After;
 * the CLI never sends exports in parallel, so in practice this only slows
 * down scripts that do.
 */
export function createConcurrencyLimit({
  max,
  retryAfterSeconds,
  message,
}: {
  max: number;
  retryAfterSeconds: number;
  message: string;
}): RequestHandler {
  const running = new Map<string, number>();
  return (req, res, next) => {
    if (shouldSkipRateLimit()) {
      next();
      return;
    }
    const key = accountOrIpKey(req);
    const count = running.get(key) ?? 0;
    if (count >= max) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ error: "rate_limited", message });
      return;
    }
    running.set(key, count + 1);
    // `close` fires once per response, whether it finished or the client
    // went away. Batch export stops converting when the client is gone, so
    // a dropped request frees its slot after at most one more document.
    res.once("close", () => {
      const left = (running.get(key) ?? 1) - 1;
      if (left > 0) running.set(key, left);
      else running.delete(key);
    });
    next();
  };
}

export const exportConcurrencyLimit = createConcurrencyLimit({
  max: 4,
  retryAfterSeconds: 2,
  message: "Too many exports running at once. Wait for one to finish and try again.",
});

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A per-IP limit on a no-account route. The number is read from
 * FREE_TOOL_LIMITS on every request (packages/shared/src/config/free-tools.ts
 * has the numbers and the reasoning), and IPv6 clients are bucketed by /56.
 */
function createFreeToolIpLimit(windowMs: number, limit: () => number, message: string): RateLimitRequestHandler {
  return createRateLimiter({
    windowMs,
    limit,
    keyGenerator: ipKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "rate_limited", message },
  });
}

/**
 * A ceiling across every client: one shared bucket, so a botnet spread over
 * thousands of addresses (each under its per-IP limits) still can't queue
 * more work than the converter or the database can take. Production can
 * raise or lower each threshold through the environment (FREE_TOOL_ENV in
 * packages/shared/src/config/free-tools-env.ts) without a code change. Over the ceiling
 * everyone gets `503 service_busy` with Retry-After until the window rolls
 * over, which fails closed instead of letting signed-in exports time out.
 *
 * Only requests that succeed count (skipFailedRequests), so junk that's
 * rejected anyway (honeypot, empty or oversized input, a per-IP 429) can't
 * use the budget up. These limiters run before the per-IP ones, so while the
 * breaker is open a person's own per-IP allowance isn't spent either. No
 * RateLimit-* headers: they would overwrite the per-IP ones and tell
 * everyone how much global room is left.
 */
function createGlobalCircuitBreaker(
  windowMs: number,
  limit: () => number,
  message: string,
): RateLimitRequestHandler {
  return createRateLimiter({
    windowMs,
    limit,
    keyGenerator: () => "global",
    skipFailedRequests: true,
    standardHeaders: false,
    legacyHeaders: false,
    handler: (req, res) => {
      const resetTime = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
      const seconds = resetTime ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000)) : Math.ceil(windowMs / 1000);
      res.setHeader("Retry-After", String(seconds));
      res.status(503).json({ error: "service_busy", message });
    },
  });
}

// Public, unauthenticated converter endpoints (`/api/v1/tools/convert/*`).
// Much stricter than the signed-in export limits because there's no account or
// API key to attribute abuse to, only the source IP. Per IP: a burst cap, an
// hourly cap so nobody sustains the burst rate, and a daily cap so nobody
// sustains the hourly one. Then two global breakers. See FREE_TOOL_LIMITS.
const convert = FREE_TOOL_LIMITS.converter;

export const publicConvertBurstRateLimit = createFreeToolIpLimit(
  MINUTE,
  () => convert.perIp.perMinute,
  "Too many conversions. Wait a minute and try again.",
);

export const publicConvertHourlyRateLimit = createFreeToolIpLimit(
  HOUR,
  () => convert.perIp.perHour,
  "You've hit this hour's limit for the free converter. Try again later, or sign up free for higher limits.",
);

export const publicConvertDailyRateLimit = createFreeToolIpLimit(
  DAY,
  () => convert.perIp.perDay,
  "You've hit today's limit for the free converter. Sign up free for higher limits, or come back tomorrow.",
);

const CONVERTER_BUSY =
  "The free converter is busy right now. Try again in a few minutes, or sign up free: signed-in exports aren't affected.";

export const publicConvertGlobalMinuteLimit = createGlobalCircuitBreaker(
  MINUTE,
  () => converterGlobalLimits().perMinute,
  CONVERTER_BUSY,
);

export const publicConvertGlobalHourlyLimit = createGlobalCircuitBreaker(
  HOUR,
  () => converterGlobalLimits().perHour,
  CONVERTER_BUSY,
);

// Email sign-in codes. Each request sends an email, so keep it tight per IP
// (per /56 for IPv6, or one subscriber could rotate through its /64 and
// email-bomb someone); Better Auth separately caps wrong guesses per code
// (5 attempts).
export const codeRequestRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: ipKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "rate_limited",
    message: "Too many sign-in code requests. Wait 15 minutes and try again.",
  },
});

export const codeVerifyRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: ipKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "rate_limited",
    message: "Too many sign-in attempts. Wait 15 minutes and try again.",
  },
});

// Anonymous publishing has no account to attribute abuse to, only the IP.
// The hourly cap covers publishes and updates together; the daily cap and
// the global breakers apply to new documents only (each is a new row).
const anonymous = FREE_TOOL_LIMITS.anonymousPublish;

export const anonymousPublishRateLimit = createFreeToolIpLimit(
  HOUR,
  () => anonymous.perIp.perHour,
  "Too many anonymous publishes from this address. Sign up with `opendocs login --email <you@example.com>` for higher limits.",
);

export const anonymousPublishDailyRateLimit = createFreeToolIpLimit(
  DAY,
  () => anonymous.perIp.perDay,
  "You've hit today's limit for anonymous publishing from this address. Sign up free with `opendocs login --email <you@example.com>` (or at opendocs.cc/signup) to keep publishing.",
);

const ANONYMOUS_BUSY =
  "Anonymous publishing is busy right now. Try again in a few minutes, or sign up free: signed-in publishing isn't affected.";

export const anonymousPublishGlobalMinuteLimit = createGlobalCircuitBreaker(
  MINUTE,
  () => anonymousPublishGlobalLimits().perMinute,
  ANONYMOUS_BUSY,
);

export const anonymousPublishGlobalHourlyLimit = createGlobalCircuitBreaker(
  HOUR,
  () => anonymousPublishGlobalLimits().perHour,
  ANONYMOUS_BUSY,
);

export const anonymousPublishGlobalDailyLimit = createGlobalCircuitBreaker(
  DAY,
  () => anonymousPublishGlobalLimits().perDay,
  ANONYMOUS_BUSY,
);

// "Report this page" on anonymous pages. Each report can message the owner,
// so it's kept tight; reports are also deduplicated per reporter.
export const anonymousReportHourlyRateLimit = createFreeToolIpLimit(
  HOUR,
  () => FREE_TOOL_LIMITS.reports.perIp.perHour,
  "Too many reports from this address. Try again later.",
);

export const anonymousReportDailyRateLimit = createFreeToolIpLimit(
  DAY,
  () => FREE_TOOL_LIMITS.reports.perIp.perDay,
  "Too many reports from this address today. Try again tomorrow.",
);

// Browser extension: failure pings (an extension retries a broken site a few
// times a minute at most) and the one-question uninstall page.
export const extensionEventsRateLimit = createFreeToolIpLimit(
  HOUR,
  () => 60,
  "Too many events from this address. Try again later.",
);

export const extensionFeedbackRateLimit = createFreeToolIpLimit(
  DAY,
  () => 5,
  "Thanks, we already have your answer.",
);
