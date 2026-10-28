/**
 * Publish-time remote-image rehost.
 *
 * When a post is published or updated we scan its raw markdown for
 * `![alt](url)` images pointing at external origins (Wikimedia, Unsplash,
 * blog CDNs, etc.), download them under strict SSRF + size + timeout
 * limits, re-upload to R2, and rewrite the markdown to point at the R2
 * copy. The downstream effects:
 *
 *   - DOCX/PDF exports via the Python converter can always reach the
 *     image because `assets.opendocs.cc` is ours — upstream CDNs that
 *     block the converter's User-Agent, rate-limit, or outright 403
 *     (Wikimedia does this by default) no longer break exports.
 *   - Published posts are immune to image rot / link rot.
 *   - Ad blockers that chew up upstream origins don't break anything.
 *
 * Rehost is best-effort. Failures (network, oversize, SSRF guard, bad
 * MIME) leave the original URL in place so the downstream converter's
 * own fallback can still try to fetch, or fall back to an `[alt]`
 * placeholder if that also fails. The publish succeeds either way.
 */

import type { LookupAddress, LookupOptions } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";

import { Agent, fetch as undiciFetch } from "undici";

import {
  IMAGE_MIME_TYPES,
  extForMime,
  isImageMime,
  isStorageConfigured,
  storageKeys,
  uploadObject,
} from "../storage/r2";

// ---- Limits ------------------------------------------------------------

/** Per-image byte cap. Wikimedia thumbnails are ~200 KB; 5 MB is huge. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Per-document image count cap. Prevents a single publish from DoSing R2. */
const MAX_IMAGES_PER_DOC = 30;
/** Network timeout for each hop (initial + redirects). */
const DOWNLOAD_TIMEOUT_MS = 10_000;
/** Redirect hops we'll follow before giving up. */
const MAX_REDIRECTS = 3;
/** Polite identifier so origins can attribute the traffic. */
const USER_AGENT = "OpenDocs-ImageRehost/0.1 (+https://opendocs.cc)";

// ---- Markdown scan -----------------------------------------------------

/**
 * Matches `![alt](url)` and `![alt](url "title")` — the inline image
 * syntax. Reference-style (`![alt][ref]`) is not covered; in the wild
 * almost no one uses it, and the cost of parsing properly (remark AST +
 * round-trip) outweighs the benefit. If it shows up, the fallthrough
 * (skip rehost, trust the downstream converter's own fetch) still works.
 *
 * The URL group is captured up to the first whitespace or closing paren
 * that isn't inside parentheses (`()`). We keep it simple: URLs with
 * literal `)` characters are extremely rare in practice — most CDNs
 * percent-encode them.
 */
const IMAGE_RE = /!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"[^"]*")?\s*\)/g;

type ImageMatch = {
  full: string;
  alt: string;
  url: string;
};

function findImages(markdown: string): ImageMatch[] {
  const out: ImageMatch[] = [];
  for (const m of markdown.matchAll(IMAGE_RE)) {
    const [full, alt, url] = m;
    out.push({ full, alt: alt ?? "", url: url ?? "" });
  }
  return out;
}

// ---- SSRF guard --------------------------------------------------------

/**
 * Hostnames we flat-out refuse before even attempting DNS. Covers the
 * most common internal names that aren't publicly resolvable.
 */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "0.0.0.0",
  "broadcasthost",
  "metadata.google.internal",
  "metadata",
]);

function isBlockedHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (BLOCKED_HOSTS.has(lower)) return true;
  if (lower.endsWith(".local")) return true;
  if (lower.endsWith(".internal")) return true;
  if (lower.endsWith(".localhost")) return true;
  return false;
}

/**
 * Block the common private/reserved IPv4 and IPv6 ranges. Intentionally
 * over-broad: anything that isn't a routable public IP gets rejected.
 * The AWS/GCP metadata endpoint (169.254.169.254) falls inside
 * link-local, so that's covered.
 */
function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIpv4(ip);
  if (v === 6) return isPrivateIpv6(ip);
  return true; // unparseable → treat as private (fail-closed)
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((s) => Number(s));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return true; // unparseable → fail closed
  const embeddedV4 = () => `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
  // ::, ::1 and the deprecated IPv4-compatible ::a.b.c.d.
  if (g.slice(0, 6).every((x) => x === 0)) return true;
  // IPv4-mapped (::ffff:a.b.c.d, also written ::ffff:7f00:1) and NAT64
  // (64:ff9b::a.b.c.d) reach the embedded IPv4 address: check that.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPrivateIpv4(embeddedV4());
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPrivateIpv4(embeddedV4());
  if ((g[0] & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return true; // site-local fec0::/10 (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/** The eight 16-bit groups of an IPv6 address, or null if it doesn't parse. */
function ipv6Groups(ip: string): number[] | null {
  const halves = ip.split("%")[0].split("::");
  if (halves.length > 2) return null;
  const split = (part: string) => (part ? part.split(":") : []);
  const head = split(halves[0]);
  const tail = halves.length === 2 ? split(halves[1]) : [];
  // A trailing dotted IPv4 part (::ffff:10.0.0.1) is two groups.
  const last = tail.length > 0 ? tail : head;
  const dotted = last[last.length - 1];
  if (dotted?.includes(".")) {
    const octets = dotted.split(".").map(Number);
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    last.splice(-1, 1, ((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16));
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail].map((part) =>
    /^[0-9a-f]{1,4}$/i.test(part) ? parseInt(part, 16) : Number.NaN,
  );
  return groups.every((x) => Number.isInteger(x)) ? groups : null;
}

/**
 * Resolve `host` via DNS (or accept it directly if it's already an IP)
 * and return its addresses, or null if any of them isn't in
 * publicly-routable space.
 *
 * We check *all* resolved addresses — a multi-A-record host where one
 * maps to a public IP and another to a private one is still unsafe,
 * because we don't control which the connect step picks.
 */
async function resolvePublicAddresses(host: string): Promise<LookupAddress[] | null> {
  if (isBlockedHost(host)) return null;
  const literal = isIP(host);
  if (literal) return isPrivateIp(host) ? null : [{ address: host, family: literal }];
  try {
    const addrs = await dnsLookup(host, { all: true, verbatim: true });
    if (addrs.length === 0) return null;
    return addrs.every((a) => !isPrivateIp(a.address)) ? addrs : null;
  } catch {
    return null;
  }
}

async function isSafeHost(host: string): Promise<boolean> {
  return (await resolvePublicAddresses(host)) !== null;
}

/** Error code a refused connection carries, so downloads can report it. */
const BLOCKED_HOST_CODE = "ERR_IMAGE_REHOST_BLOCKED_HOST";

/**
 * The DNS lookup every download connection uses (undici passes it to
 * `net.connect` / `tls.connect`). It resolves the hostname once, refuses
 * the connection unless every address is public, and hands the socket the
 * same addresses it checked. Checking in a separate lookup before `fetch`
 * would leave a DNS-rebinding window: a short-TTL record could answer with
 * a public address for the check and a private one (cloud metadata,
 * localhost, the Compose network) for the connect.
 *
 * Node doesn't call `lookup` for IP literals; downloadImage rejects private
 * ones before connecting.
 */
const guardedLookup: LookupFunction = (hostname, options: LookupOptions, callback) => {
  resolvePublicAddresses(hostname).then(
    (addrs) => {
      const family = options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : options.family;
      const usable = addrs?.filter((a) => !family || a.family === family) ?? [];
      if (usable.length === 0) {
        const error: NodeJS.ErrnoException = new Error(
          addrs ? `No usable address for ${hostname}` : `Refusing to connect to ${hostname}: not a public address`,
        );
        error.code = addrs ? "ENOTFOUND" : BLOCKED_HOST_CODE;
        callback(error, "", 0);
        return;
      }
      if (options.all) callback(null, usable);
      else callback(null, usable[0].address, usable[0].family);
    },
    (err: NodeJS.ErrnoException) => callback(err, "", 0),
  );
};

/**
 * Connection pool for image downloads. Every new connection goes through
 * guardedLookup, so an idle keep-alive socket is always one to an address
 * that was checked when it was opened.
 */
const downloadAgent = new Agent({
  connect: { lookup: guardedLookup, timeout: DOWNLOAD_TIMEOUT_MS },
});

type DownloadRequest = {
  method: "GET";
  redirect: "manual";
  signal: AbortSignal;
  headers: Record<string, string>;
};

/**
 * The HTTP client downloads go through: undici's own fetch with the guarded
 * agent (Node's built-in fetch may bundle a different undici major than the
 * `undici` package, so the two aren't mixed). Tests replace `fetch`.
 */
const transport = {
  fetch: (url: string, init: DownloadRequest): Promise<Response> =>
    undiciFetch(url, { ...init, dispatcher: downloadAgent }) as unknown as Promise<Response>,
};

function isBlockedHostError(err: unknown): boolean {
  for (let cause = err; cause instanceof Error; cause = cause.cause) {
    if ((cause as NodeJS.ErrnoException).code === BLOCKED_HOST_CODE) return true;
  }
  return false;
}

// ---- Download ----------------------------------------------------------

type DownloadResult =
  | { ok: true; bytes: Uint8Array; contentType: string; ext: string }
  | { ok: false; reason: string };

async function downloadImage(initialUrl: string): Promise<DownloadResult> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      return { ok: false, reason: "invalid_url" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, reason: "unsupported_protocol" };
    }
    // Blocked names and IP literals are refused here, before any
    // connection. Hostnames are resolved and checked by guardedLookup as
    // the connection opens, on every hop, so each redirect target gets the
    // same check.
    const host = parsed.hostname.replace(/^\[(.*)\]$/, "$1");
    if (isBlockedHost(host) || (isIP(host) && isPrivateIp(host))) {
      return { ok: false, reason: "blocked_host" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await transport.fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: IMAGE_MIME_TYPES.join(", "),
        },
      });
    } catch (err) {
      return { ok: false, reason: isBlockedHostError(err) ? "blocked_host" : "network_error" };
    } finally {
      clearTimeout(timer);
    }

    // Manual redirect follow so the next hop gets its own SSRF check.
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location");
      if (!location) return { ok: false, reason: "redirect_without_location" };
      // `new URL(location, currentUrl)` handles both absolute + relative.
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        return { ok: false, reason: "bad_redirect_target" };
      }
      continue;
    }

    if (!resp.ok) return { ok: false, reason: `status_${resp.status}` };

    const rawCt = resp.headers.get("content-type") ?? "";
    const contentType = rawCt.split(";")[0].trim().toLowerCase();
    if (!isImageMime(contentType)) {
      return { ok: false, reason: "unsupported_mime" };
    }

    // Size cap. Prefer Content-Length when present so we can bail before
    // pulling the body; otherwise check as chunks arrive.
    const contentLength = Number(resp.headers.get("content-length") ?? "0");
    if (contentLength && contentLength > MAX_IMAGE_BYTES) {
      return { ok: false, reason: "oversize" };
    }

    if (!resp.body) return { ok: false, reason: "empty_body" };

    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          return { ok: false, reason: "oversize" };
        }
        chunks.push(value);
      }
    } catch {
      return { ok: false, reason: "stream_error" };
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }

    let ext: string;
    try {
      ext = extForMime(contentType);
    } catch {
      return { ok: false, reason: "unsupported_mime" };
    }
    return { ok: true, bytes, contentType, ext };
  }
  return { ok: false, reason: "too_many_redirects" };
}

// ---- Public entrypoint -------------------------------------------------

export type RehostOptions = {
  markdown: string;
  workspaceId: string;
  /** Override for tests. */
  onLog?: (message: string, meta?: Record<string, unknown>) => void;
};

export type RehostResult = {
  markdown: string;
  /** Count of URLs successfully replaced. */
  rehosted: number;
  /** Count of URLs we tried but couldn't rehost (any reason). */
  skipped: number;
};

/**
 * Returns a new markdown string with remote image URLs replaced by
 * freshly-uploaded R2 URLs. Safe to call when storage is unconfigured
 * (returns the original markdown unchanged).
 *
 * URLs already on our R2 public origin are left alone — they're already
 * rehosted, and downloading-and-reuploading would just waste a round
 * trip. URLs the regex doesn't match (reference-style, raw HTML `<img>`,
 * etc.) also pass through untouched; the downstream converter's own
 * fetch is still the fallback for anything we skip.
 */
export async function rehostRemoteImages(
  options: RehostOptions,
): Promise<RehostResult> {
  const { markdown, workspaceId, onLog } = options;

  if (!isStorageConfigured()) {
    return { markdown, rehosted: 0, skipped: 0 };
  }

  const matches = findImages(markdown);
  if (matches.length === 0) {
    return { markdown, rehosted: 0, skipped: 0 };
  }

  const publicOrigin = getPublicOrigin();

  // De-dup by URL so the same image used N times downloads once.
  const unique: string[] = [];
  for (const m of matches) {
    if (!unique.includes(m.url)) unique.push(m.url);
  }

  const replacements = new Map<string, string>();
  let rehosted = 0;
  let skipped = 0;
  let processed = 0;

  for (const url of unique) {
    if (processed >= MAX_IMAGES_PER_DOC) {
      onLog?.("image-rehost.cap_hit", { processed, total: unique.length });
      break;
    }
    processed++;

    // Skip URLs that aren't http(s) — data URIs, relative paths, etc.
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      skipped++;
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      skipped++;
      continue;
    }
    // Skip URLs already on our public origin — already rehosted.
    if (publicOrigin && parsed.origin === publicOrigin) {
      continue;
    }

    const download = await downloadImage(url);
    if (!download.ok) {
      skipped++;
      onLog?.("image-rehost.skipped", { url, reason: download.reason });
      continue;
    }

    const key = storageKeys.postImage(workspaceId, download.ext);
    try {
      const { url: publicUrl } = await uploadObject({
        key,
        body: download.bytes,
        contentType: download.contentType,
      });
      replacements.set(url, publicUrl);
      rehosted++;
    } catch (err) {
      skipped++;
      onLog?.("image-rehost.upload_error", {
        url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (replacements.size === 0) {
    return { markdown, rehosted, skipped };
  }

  // Rewrite by walking the same regex and substituting only URLs we
  // successfully rehosted. This preserves titles / alt text and any
  // surrounding markdown verbatim.
  const rewritten = markdown.replace(
    IMAGE_RE,
    (full, alt: string, origUrl: string) => {
      const replaced = replacements.get(origUrl);
      if (!replaced) return full;
      // Re-emit in canonical form. We drop the optional title — titles
      // are rare, and round-tripping them safely through the regex is
      // more complexity than it's worth for v1.
      return `![${alt ?? ""}](${replaced})`;
    },
  );

  return { markdown: rewritten, rehosted, skipped };
}

function getPublicOrigin(): string | null {
  const raw = process.env.R2_PUBLIC_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

// ---- Exported internals (tests only) -----------------------------------

export const __internal = {
  findImages,
  isSafeHost,
  isPrivateIp,
  guardedLookup,
  transport,
  downloadImage,
  IMAGE_RE,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_DOC,
};
