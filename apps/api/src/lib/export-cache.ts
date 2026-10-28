/**
 * Content-addressed cache for rendered PDF/DOCX exports in R2.
 *
 * The privacy model and trade-offs, in short:
 *
 *   - Cache key = sha256(workspaceId, format, landscape, rawMarkdown,
 *     resolvedBranding, accent, schemaVersion). Workspace is in the
 *     hash so cross-tenant dedup is impossible — two workspaces with
 *     identical content still get different keys.
 *   - R2 object layout: exports/<workspaceId>/<shard>/<hash>.<ext>.
 *   - The object is NEVER served via a public URL. Export routes
 *     always stream bytes through the authenticated API response.
 *     Public-bucket access to `assets.opendocs.cc` is a CDN
 *     convenience for other asset types (logos, avatars), not an
 *     exposure surface here.
 *
 * The whole module is a best-effort layer: if R2 is misconfigured or
 * down, every call silently degrades to "cache miss". The export
 * routes then convert as usual, so a broken cache cannot take down
 * exports.
 */

import { createHash } from "node:crypto";
import {
  getObject,
  uploadObject,
  isStorageConfigured,
  storageKeys,
} from "@opendocs/shared/storage/r2";
import type { ConvertFormat } from "./converter";

// ---- Schema version ----------------------------------------------------

/**
 * Bump this whenever the converter's output bytes change for the same
 * inputs — e.g. LibreOffice upgrade, Puppeteer upgrade, a tweak to the
 * shared CSS template in doc-converter/app/templates/. Bumping shifts
 * every cache key, orphaning the old R2 objects which age out via the
 * bucket's 90-day lifecycle rule on the `exports/` prefix.
 *
 * We keep this as a bare string constant rather than reading from env
 * because it's code-coupled: a converter change needs a matching API
 * deploy, and tying the invalidation version to the deploy artifact is
 * exactly what we want.
 */
// v4: converter rewrite (alerts, math, highlighting, figures, tables).
const CACHE_SCHEMA_VERSION = "v4";

// ---- Feature flag ------------------------------------------------------

/**
 * Master off-switch. Defaults to OFF so rolling the code out does not
 * change behavior — flip `EXPORT_CACHE_ENABLED=true` in the API env once
 * the R2 lifecycle rule is in place and we've verified staging.
 *
 * Read at call time, not at module load, so the test suite can toggle
 * it with `process.env.EXPORT_CACHE_ENABLED = "true"` per test.
 */
export function isExportCacheEnabled(): boolean {
  return (
    process.env.EXPORT_CACHE_ENABLED === "true" && isStorageConfigured()
  );
}

// ---- Cache-key computation ---------------------------------------------

export interface ExportCacheInputs {
  workspaceId: string;
  format: ConvertFormat;
  landscape: boolean;
  rawMarkdown: string;
  /**
   * The **resolved** branding, i.e. the output of
   * `resolveExportBranding()`. Hashing the resolved payload (not the
   * raw caller body) means two callers who pass different things but
   * merge to the same final payload share a cache entry — exactly what
   * we want for the CLI-vs-dashboard path.
   */
  resolvedBranding: Record<string, unknown> | undefined;
  resolvedAccentColor: string | undefined;
}

/**
 * Deterministic JSON stringify. Plain `JSON.stringify` preserves
 * insertion order of keys, which would give us different hashes for
 * `{a:1,b:2}` vs `{b:2,a:1}` even though they describe the same
 * payload. We sort keys recursively.
 *
 * Intentionally simple — we don't handle Dates, Maps, Sets, etc.
 * Branding payloads are plain JSON values by construction.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/**
 * Compute the deterministic R2 key for the export these inputs would
 * produce. Identical inputs (within the same workspace) → identical
 * key → cache hit.
 */
export function computeExportCacheKey(inputs: ExportCacheInputs): string {
  // NUL-free line separator between fields — rawMarkdown can contain
  // anything but a NUL byte, and the SHA stays the same if we swap to
  // a different separator later. We choose '\n' for grep-friendly
  // debug output if we ever log the pre-hash payload.
  const payload = [
    inputs.workspaceId,
    inputs.format,
    inputs.landscape ? "1" : "0",
    inputs.rawMarkdown,
    stableStringify(inputs.resolvedBranding ?? {}),
    inputs.resolvedAccentColor ?? "",
    CACHE_SCHEMA_VERSION,
  ].join("\n");

  const hash = createHash("sha256").update(payload).digest("hex");
  return storageKeys.exportObject(inputs.workspaceId, hash, inputs.format);
}

// ---- Cache read / write ------------------------------------------------

export interface CachedExport {
  buffer: Buffer;
  contentType: string;
}

/**
 * Content types matching what the doc-converter returns. We have to
 * synthesize them on cache-hit because the bytes came from R2, not
 * from the converter, so we can't read them off a response header.
 * These are fixed for pdf/docx and stable across LibreOffice versions.
 */
const CONTENT_TYPE_BY_FORMAT: Record<ConvertFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * Try to serve the export from cache. Returns `null` on cache miss,
 * on disabled cache, and on any R2 error — all three collapse to "fall
 * through to the converter" at the call site. The only way this
 * throws is if the R2 response contains data but can't be buffered,
 * which would be a legitimate bug worth surfacing.
 */
export async function getCachedExport(
  inputs: ExportCacheInputs,
): Promise<CachedExport | null> {
  if (!isExportCacheEnabled()) return null;

  const key = computeExportCacheKey(inputs);
  try {
    const buffer = await getObject(key);
    if (!buffer) return null;
    return {
      buffer,
      contentType: CONTENT_TYPE_BY_FORMAT[inputs.format],
    };
  } catch {
    // R2 read errors (network, auth, bucket policy, …) should not
    // break exports. Fall through and the caller will regenerate.
    return null;
  }
}

/**
 * Store a freshly-converted export in the cache. Fire-and-forget from
 * the caller's perspective — the returned promise is always a
 * fulfilled promise because we swallow errors internally. Callers
 * typically use `void storeCachedExport(...)` so the response goes
 * out before the upload finishes.
 *
 * We use `max-age=31536000, immutable` because the key is content-
 * addressed: a given key's bytes will never change. (The 90-day
 * lifecycle rule on the bucket handles eviction — browser-level cache
 * TTL is independent and irrelevant since we stream through the API.)
 */
export async function storeCachedExport(
  inputs: ExportCacheInputs,
  buffer: Buffer,
): Promise<void> {
  if (!isExportCacheEnabled()) return;

  const key = computeExportCacheKey(inputs);
  try {
    await uploadObject({
      key,
      body: buffer,
      contentType: CONTENT_TYPE_BY_FORMAT[inputs.format],
      cacheControl: "public, max-age=31536000, immutable",
    });
  } catch (err) {
    // Losing a cache write is strictly an efficiency issue, not a
    // correctness one — the response already succeeded. Log for
    // observability but never throw.
    // eslint-disable-next-line no-console
    console.warn(
      "[export-cache] storeCachedExport failed",
      { key, err: err instanceof Error ? err.message : String(err) },
    );
  }
}
