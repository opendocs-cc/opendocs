import { and, desc, eq, max, sql } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import { auditEvents, posts, postVersions, usernames } from "../db/schema";
import { RENDERER_VERSION, renderMarkdown } from "../markdown/index";
import { normalizeStoredRenderedHtml } from "../markdown/normalize-rendered-html";
import { extractMarkdownExcerpt } from "./excerpt";
import { currentRendering } from "./rendering";
import { assertCanEditWorkspacePost } from "./service";

type VersionMetadata = {
  contentHash?: string;
  client?: string;
  title?: string;
  restoredFromVersion?: number;
  sourcePath?: string;
};

function readMetadata(value: unknown): VersionMetadata {
  return value && typeof value === "object" ? (value as VersionMetadata) : {};
}

/**
 * Every version of a post, newest first. Callers must have already checked
 * that the viewer can read the post.
 */
export async function listPostVersions(postId: string) {
  const database = getDbOrThrow();
  const [post] = await database
    .select({ currentVersionId: posts.currentVersionId })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  const rows = await database
    .select({
      id: postVersions.id,
      versionNumber: postVersions.versionNumber,
      createdAt: postVersions.createdAt,
      createdByUserId: postVersions.createdByUserId,
      createdByUsername: usernames.username,
      sourceMetadata: postVersions.sourceMetadata,
      bytes: sql<number>`octet_length(${postVersions.rawMarkdown})::int`,
    })
    .from(postVersions)
    .leftJoin(usernames, eq(usernames.userId, postVersions.createdByUserId))
    .where(eq(postVersions.postId, postId))
    .orderBy(desc(postVersions.versionNumber));

  return rows.map((row) => {
    const metadata = readMetadata(row.sourceMetadata);
    return {
      id: row.id,
      versionNumber: row.versionNumber,
      createdAt: row.createdAt,
      createdBy: row.createdByUsername ?? null,
      client: metadata.client ?? null,
      contentHash: metadata.contentHash ?? null,
      restoredFromVersion: metadata.restoredFromVersion ?? null,
      bytes: row.bytes,
      isCurrent: row.id === post?.currentVersionId,
    };
  });
}

/**
 * Rendered content of one version for the article page's version view,
 * or null when it doesn't exist. Callers must have already checked that
 * the viewer may read the post's history.
 */
export async function getPostVersionContent(postId: string, versionNumber: number) {
  const database = getDbOrThrow();
  const [row] = await database
    .select({
      versionId: postVersions.id,
      versionNumber: postVersions.versionNumber,
      rawMarkdown: postVersions.rawMarkdown,
      renderedHtml: postVersions.renderedHtml,
      toc: postVersions.toc,
      sourceMetadata: postVersions.sourceMetadata,
      createdAt: postVersions.createdAt,
      words: sql<number>`coalesce(array_length(regexp_split_to_array(trim(${postVersions.rawMarkdown}), '\\s+'), 1), 0)::int`,
    })
    .from(postVersions)
    .where(and(eq(postVersions.postId, postId), eq(postVersions.versionNumber, versionNumber)))
    .limit(1);
  if (!row) return null;
  const { renderedHtml, toc } = await currentRendering(row);
  return {
    versionNumber: row.versionNumber,
    renderedHtml: normalizeStoredRenderedHtml(renderedHtml),
    toc,
    createdAt: row.createdAt,
    readingMinutes: Math.max(1, Math.round(row.words / 230)),
  };
}

/** Raw Markdown of one version, or null when it doesn't exist. */
export async function getPostVersionMarkdown(postId: string, versionNumber: number) {
  const database = getDbOrThrow();
  const [row] = await database
    .select({
      versionNumber: postVersions.versionNumber,
      rawMarkdown: postVersions.rawMarkdown,
      createdAt: postVersions.createdAt,
    })
    .from(postVersions)
    .where(and(eq(postVersions.postId, postId), eq(postVersions.versionNumber, versionNumber)))
    .limit(1);
  return row ?? null;
}

/**
 * Rolls a post back by copying an earlier version forward as a new version,
 * so history stays append-only and the rollback itself can be undone. The
 * author or a workspace admin may restore. Visibility, tags and project are
 * left as they are; the title follows the restored content.
 */
export async function restorePostVersion(
  userId: string,
  postId: string,
  versionNumber: number,
  options: { client?: string | null } = {},
) {
  const database = getDbOrThrow();
  const [post] = await database
    .select({
      id: posts.id,
      authorUserId: posts.authorUserId,
      workspaceId: posts.workspaceId,
      isPublished: posts.isPublished,
      currentVersionId: posts.currentVersionId,
    })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!post) {
    throw new Error("Post not found.");
  }
  await assertCanEditWorkspacePost(userId, post);
  if (!post.isPublished) {
    throw new Error("Cannot restore a version of an unpublished post.");
  }

  const [source] = await database
    .select({
      id: postVersions.id,
      rawMarkdown: postVersions.rawMarkdown,
      sourceMetadata: postVersions.sourceMetadata,
    })
    .from(postVersions)
    .where(and(eq(postVersions.postId, postId), eq(postVersions.versionNumber, versionNumber)))
    .limit(1);

  if (!source) {
    return null;
  }

  const sourceMetadata = readMetadata(source.sourceMetadata);
  const rendered = await renderMarkdown(source.rawMarkdown);
  const title = sourceMetadata.title ?? rendered.title;
  const summary = extractMarkdownExcerpt(rendered.content) || null;

  return database.transaction(async (tx) => {
    await tx.execute(sql`select 1 from ${posts} where ${posts.id} = ${postId} for update`);
    const [maxVersionRow] = await tx
      .select({ maxVersion: max(postVersions.versionNumber) })
      .from(postVersions)
      .where(eq(postVersions.postId, postId));
    const nextVersion = (maxVersionRow?.maxVersion ?? 0) + 1;

    const [version] = await tx
      .insert(postVersions)
      .values({
        postId,
        versionNumber: nextVersion,
        rawMarkdown: source.rawMarkdown,
        renderedHtml: rendered.html,
        toc: rendered.toc,
        sourceMetadata: {
          ...(sourceMetadata.contentHash ? { contentHash: sourceMetadata.contentHash } : {}),
          ...(sourceMetadata.title ? { title: sourceMetadata.title } : {}),
          ...(options.client ? { client: options.client } : {}),
          restoredFromVersion: versionNumber,
          rendererVersion: RENDERER_VERSION,
        },
        createdByUserId: userId,
      })
      .returning({ id: postVersions.id });

    await tx
      .update(posts)
      .set({ currentVersionId: version.id, title, summary, updatedAt: new Date() })
      .where(eq(posts.id, postId));

    await tx.insert(auditEvents).values({
      actorUserId: userId,
      workspaceId: post.workspaceId,
      postId,
      eventType: "version_restored",
      metadata: { restoredFromVersion: versionNumber, versionNumber: nextVersion },
    });

    return {
      postId,
      versionId: version.id,
      versionNumber: nextVersion,
      restoredFromVersion: versionNumber,
      title,
    };
  });
}
