import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import { downloadLinks } from "../db/schema";

/**
 * Short-lived download links. MCP tools run in chat apps that can't take
 * file bytes, so exports and signature PDFs come back as a link instead.
 * The link carries a random token (only its hash is stored); opening it
 * renders the file as the user who asked for it, after re-checking access.
 */

export const DOWNLOAD_LINK_TTL_MS = 60 * 60 * 1000;

export type DownloadKind = "post_export" | "signature_document";

export function hashDownloadToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createDownloadLink(input: {
  userId: string;
  kind: DownloadKind;
  payload: Record<string, unknown>;
  filename: string;
  ttlMs?: number;
}) {
  const token = `dl_${randomBytes(24).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? DOWNLOAD_LINK_TTL_MS));
  await getDbOrThrow()
    .insert(downloadLinks)
    .values({
      tokenHash: hashDownloadToken(token),
      userId: input.userId,
      kind: input.kind,
      payload: input.payload,
      filename: input.filename.slice(0, 255),
      expiresAt,
    });
  return { token, expiresAt };
}

/** The live link for a token, counting the download; null when unknown or expired. */
export async function redeemDownloadLink(token: string) {
  if (!/^dl_[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const database = getDbOrThrow();
  const [link] = await database
    .update(downloadLinks)
    .set({
      downloadCount: sql`${downloadLinks.downloadCount} + 1`,
      lastDownloadedAt: new Date(),
    })
    .where(
      and(eq(downloadLinks.tokenHash, hashDownloadToken(token)), gt(downloadLinks.expiresAt, new Date())),
    )
    .returning();
  return link ?? null;
}
