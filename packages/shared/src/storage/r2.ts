/**
 * Cloudflare R2 storage adapter (or any S3-compatible storage, see R2Config).
 *
 * R2 is S3-compatible, so we reuse the AWS S3 SDK and point it at the R2
 * endpoint. Secrets are server-only — this module is never imported from
 * Next.js client components.
 *
 * Configuration comes from env vars (see .env.example). If any
 * required var is missing we export a disabled adapter that throws a
 * `storage_not_configured` error at call time — the rest of the API keeps
 * working so a misconfigured environment does not take the whole service
 * down.
 */

import { randomBytes } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ---- Config ------------------------------------------------------------

export type R2Config = {
  /** Cloudflare account id: the endpoint is https://<id>.r2.cloudflarestorage.com. */
  accountId: string;
  /**
   * Any other S3-compatible storage (AWS S3, Backblaze B2, MinIO, …):
   * R2_ENDPOINT, with R2_REGION and R2_FORCE_PATH_STYLE=true (MinIO) when
   * it needs them. R2_ACCOUNT_ID isn't needed then.
   */
  endpoint: string | null;
  region: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /**
   * Public base URL used to construct browser-reachable URLs for uploaded
   * objects. For the Cloudflare-managed dev subdomain this looks like
   * `https://pub-<hash>.r2.dev`. Change this value when the public
   * storage hostname changes.
   */
  publicUrl: string;
};

function readConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL;

  const endpoint = process.env.R2_ENDPOINT?.trim() || null;
  if (
    (!accountId && !endpoint) ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !publicUrl
  ) {
    return null;
  }

  // Strip trailing slash so joining produces single-slash URLs.
  const normalizedPublicUrl = publicUrl.endsWith("/")
    ? publicUrl.slice(0, -1)
    : publicUrl;

  return {
    accountId: accountId ?? "",
    endpoint,
    region: process.env.R2_REGION?.trim() || "auto",
    forcePathStyle: process.env.R2_FORCE_PATH_STYLE === "true",
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl: normalizedPublicUrl,
  };
}

// ---- Errors ------------------------------------------------------------

export class StorageError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.status = status;
  }
}

// ---- Client ------------------------------------------------------------

let cachedClient: S3Client | null = null;

function getClient(config: R2Config): S3Client {
  if (cachedClient) return cachedClient;

  cachedClient = new S3Client({
    // R2 ignores the region, but the SDK requires one.
    region: config.region,
    endpoint: config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
  });

  return cachedClient;
}

// ---- Public API --------------------------------------------------------

export function isStorageConfigured(): boolean {
  return readConfig() !== null;
}

export const MAX_DIRECT_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

function requireConfig(): R2Config {
  const config = readConfig();
  if (!config) {
    throw new StorageError(
      "storage_not_configured",
      "Object storage is not configured on this server. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_URL.",
      503,
    );
  }
  return config;
}

/**
 * Upload a buffer to R2. Returns the public URL.
 */
export async function uploadObject(args: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  cacheControl?: string;
}): Promise<{ url: string; key: string }> {
  const config = requireConfig();
  const client = getClient(config);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
      CacheControl: args.cacheControl ?? "public, max-age=31536000, immutable",
    }),
  );

  return {
    url: publicUrlFor(args.key),
    key: args.key,
  };
}

/**
 * Generate a presigned PUT URL. Used by the CLI to upload images directly
 * without streaming bytes through the API server. TTL defaults to 5 min.
 */
export async function createPresignedUploadUrl(args: {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
}): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  const config = requireConfig();
  const client = getClient(config);

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: args.key,
    ContentType: args.contentType,
    ContentLength: args.contentLength,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: args.expiresInSeconds ?? 300,
    signableHeaders: new Set(["content-type", "content-length"]),
  });

  return {
    uploadUrl,
    publicUrl: publicUrlFor(args.key),
    key: args.key,
  };
}

/**
 * Read an object's bytes back from R2. Returns `null` when the key does
 * not exist so callers can treat "cache miss" and "storage disabled" as
 * interchangeably recoverable paths (both just fall through to
 * regenerating the content). Any other error propagates — if the bucket
 * is down or returns garbage we want the caller to know.
 *
 * The body is fully buffered into memory. For the current call sites
 * (cached PDF/DOCX exports, capped at a few MB each) this is fine; if
 * we ever cache multi-hundred-MB artifacts this should return a stream.
 */
export async function getObject(key: string): Promise<Buffer | null> {
  if (!isStorageConfigured()) return null;
  const config = requireConfig();
  const client = getClient(config);

  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    if (!response.Body) return null;
    // `transformToByteArray()` is the SDK's cross-runtime way to
    // exhaust the body stream — works in Node and edge runtimes alike.
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (err) {
    // R2 surfaces missing keys as either `NoSuchKey` or `NotFound`
    // depending on request path — treat both as cache miss. Anything
    // else is a real error (auth, network, bucket misconfig).
    const name = (err as { name?: string; Code?: string }).name;
    const code = (err as { name?: string; Code?: string }).Code;
    if (name === "NoSuchKey" || name === "NotFound" || code === "NoSuchKey") {
      return null;
    }
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const config = requireConfig();
  const client = getClient(config);

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
  );
}

export function publicUrlFor(key: string): string {
  const config = requireConfig();
  return `${config.publicUrl}/${key}`;
}

/**
 * Best-effort health probe. Called on startup to surface misconfiguration
 * early (wrong credentials, bucket doesn't exist, permission denied).
 * Returns `true` if we could reach the bucket, `false` otherwise. Never
 * throws — startup should still succeed even if R2 is down.
 */
export async function pingStorage(): Promise<boolean> {
  const config = readConfig();
  if (!config) return false;

  try {
    const client = getClient(config);
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return true;
  } catch {
    return false;
  }
}

// ---- Key helpers -------------------------------------------------------

const SAFE_EXT = /^[a-z0-9]{1,8}$/;

function sanitizeExt(ext: string): string {
  const clean = ext.replace(/^\./, "").toLowerCase();
  if (!SAFE_EXT.test(clean)) {
    throw new StorageError(
      "invalid_extension",
      `Invalid file extension: ${ext}`,
      400,
    );
  }
  return clean;
}

/**
 * Object key layout — keep these stable. Changing the prefix is a data
 * migration. Everything lives under the single `opendocs` bucket.
 *
 *   workspaces/<workspaceId>/logo-<timestamp>-<rand>.<ext>
 *   users/<userId>/avatar-<timestamp>-<rand>.<ext>
 *   posts/<workspaceId>/images/<timestamp>-<rand>.<ext>
 *   exports/<workspaceId>/<hash-shard>/<full-hash>.<ext>
 *
 * The timestamp + random suffix means replacing a logo produces a new
 * URL every time, which cache-busts automatically. Exports use a
 * content-addressed layout instead — same inputs → same key → cache hit.
 */
export const storageKeys = {
  workspaceLogo(workspaceId: string, ext: string): string {
    const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    return `workspaces/${workspaceId}/logo-${suffix}.${sanitizeExt(ext)}`;
  },
  userAvatar(userId: string, ext: string): string {
    const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    return `users/${userId}/avatar-${suffix}.${sanitizeExt(ext)}`;
  },
  postImage(workspaceId: string, ext: string): string {
    const suffix = `${Date.now()}-${randomBytes(6).toString("hex")}`;
    return `posts/${workspaceId}/images/${suffix}.${sanitizeExt(ext)}`;
  },
  /**
   * Cached PDF/DOCX export. The `hash` arg is the hex digest from
   * `computeExportCacheKey()` in `apps/api/src/lib/export-cache.ts` —
   * not generated here because the hashing logic lives with the export
   * route wiring and depends on resolved branding, which is an API-layer
   * concern. This helper just formats the path.
   */
  exportObject(workspaceId: string, hash: string, ext: string): string {
    const shard = hash.slice(0, 2);
    return `exports/${workspaceId}/${shard}/${hash}.${sanitizeExt(ext)}`;
  },
};

// ---- Validation helpers ------------------------------------------------

export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
] as const;

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export function extForMime(mime: string): string {
  const ext = MIME_TO_EXT[mime];
  if (!ext) {
    throw new StorageError(
      "unsupported_mime",
      `Unsupported image type: ${mime}. Use JPEG, PNG, WebP, GIF, or SVG.`,
      400,
    );
  }
  return ext;
}

export function isImageMime(mime: string): mime is ImageMimeType {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}
