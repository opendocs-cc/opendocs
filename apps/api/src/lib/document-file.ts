/**
 * A document as a file, for integrations: look up a post (by id or slug,
 * a specific version or the current one) with the same lookup and access
 * rule as exports, and render it as PDF, DOCX or Markdown with the
 * workspace's branding.
 */
import { and, eq } from "drizzle-orm";

import { getDbOrThrow } from "@opendocs/shared/db/guards";
import { posts, postVersions } from "@opendocs/shared/db/schema";
import { stripPrivateBlocks } from "@opendocs/shared/markdown/private-blocks";
import type { StorageFormat } from "@opendocs/shared/integrations/providers";

import { convertMarkdown } from "./converter";
import { getWorkspaceExportDefaultsMap, resolveExportBranding } from "./export-branding";
import { getCachedExport, storeCachedExport } from "./export-cache";
import { findAccessiblePost } from "./post-lookup";

export type IntegrationDocument = {
  id: string;
  slug: string;
  title: string;
  workspaceId: string;
  versionNumber: number;
  markdown: string;
};

export async function loadDocument(input: {
  userId: string;
  postIdOrSlug: string;
  workspaceId?: string;
  versionNumber?: number;
}): Promise<IntegrationDocument | null> {
  const post = await findAccessiblePost(input.userId, input.postIdOrSlug, input.workspaceId);
  if (!post) return null;

  const database = getDbOrThrow();
  const versionJoin = input.versionNumber
    ? and(eq(postVersions.postId, posts.id), eq(postVersions.versionNumber, input.versionNumber))
    : eq(postVersions.id, posts.currentVersionId);
  const [row] = await database
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      workspaceId: posts.workspaceId,
      versionNumber: postVersions.versionNumber,
      markdown: postVersions.rawMarkdown,
    })
    .from(posts)
    .innerJoin(postVersions, versionJoin)
    .where(eq(posts.id, post.id))
    .limit(1);
  return row ?? null;
}

/**
 * Render Markdown the way exports do. `signatureFields` asks the
 * converter to put DocuSeal field tags in signature blocks; those PDFs
 * are one-off, so they skip the export cache.
 */
export async function renderDocument(input: {
  workspaceId: string;
  markdown: string;
  format: StorageFormat;
  filename: string;
  signatureFields?: boolean;
}): Promise<Buffer> {
  if (input.format === "md") {
    return Buffer.from(`${stripPrivateBlocks(input.markdown)}\n`, "utf8");
  }
  const defaults = await getWorkspaceExportDefaultsMap([input.workspaceId]);
  const resolved = resolveExportBranding(defaults.get(input.workspaceId), {});
  const cacheInputs = {
    workspaceId: input.workspaceId,
    format: input.format,
    landscape: false,
    rawMarkdown: input.markdown,
    resolvedBranding: resolved.branding,
    resolvedAccentColor: resolved.accent_color,
  };
  if (!input.signatureFields) {
    const cached = await getCachedExport(cacheInputs);
    if (cached) return cached.buffer;
  }
  const { buffer } = await convertMarkdown(input.format, {
    markdown: input.markdown,
    filename: input.filename,
    accent_color: resolved.accent_color,
    branding: resolved.branding,
    ...(input.signatureFields ? { signature_fields: true } : {}),
  });
  if (!input.signatureFields) void storeCachedExport(cacheInputs, buffer);
  return buffer;
}
