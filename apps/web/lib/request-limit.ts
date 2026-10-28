/**
 * A small fixed-window rate limit for web route handlers, in this
 * process's memory (one web container in production; a restart resets
 * it). Used by the custom-domain sign-in bridge, which has no API in front
 * of it to lean on.
 */

type Window = { count: number; resetAt: number };

const windows = globalThis as typeof globalThis & {
  __opendocsRequestLimits?: Map<string, Window>;
};

function store() {
  windows.__opendocsRequestLimits ??= new Map();
  return windows.__opendocsRequestLimits;
}

/**
 * The client's address. Caddy sets X-Forwarded-For to the one address it
 * accepted the connection from (it trusts no proxies), so the last entry
 * is the real client; locally there's no header.
 */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const last = forwarded?.split(",").pop()?.trim();
  return last || "local";
}

/** True when this request is over the limit for `key`. */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const map = store();
  if (map.size > 10_000) {
    for (const [entryKey, entry] of map) {
      if (entry.resetAt <= now) map.delete(entryKey);
    }
  }
  const entry = map.get(key);
  if (!entry || entry.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}
