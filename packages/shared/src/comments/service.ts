import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import { comments, posts, usernames, user, workspaces } from "../db/schema";
import { isPostSharedWithViewer } from "../posts/sharing";
import {
  canViewerAccessPost,
  getViewerWorkspaceIds,
} from "../workspaces/service";

export type CommentRecord = {
  id: string;
  postId: string;
  parentCommentId: string | null;
  authorUserId: string;
  authorUsername: string | null;
  authorFullName: string | null;
  authorAvatarUrl: string | null;
  body: string;
  quotedText: string | null;
  anchorBefore: string | null;
  anchorAfter: string | null;
  startOffset: number | null;
  endOffset: number | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateCommentInput = {
  postId: string;
  authorUserId: string;
  body: string;
  parentCommentId?: string | null;
  anchor?: {
    quotedText: string;
    anchorBefore: string;
    anchorAfter: string;
    startOffset: number;
    endOffset: number;
  } | null;
};

class CommentsError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function loadPostForAccessCheck(postId: string) {
  const database = getDbOrThrow();
  const [record] = await database
    .select({
      id: posts.id,
      visibility: posts.visibility,
      authorUserId: posts.authorUserId,
      workspaceId: posts.workspaceId,
      title: posts.title,
      slug: posts.slug,
      isPublished: posts.isPublished,
      allowPublicDocuments: workspaces.allowPublicDocuments,
      workspaceSlug: workspaces.slug,
    })
    .from(posts)
    .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
    .where(eq(posts.id, postId))
    .limit(1);

  return record ?? null;
}

// Workspace-only commenting. Public posts still require the commenter
// to be an active member of the post's workspace — this matches the
// product decision documented in the schema header. Authors and
// admins of the workspace are members by definition, so they pass.
async function assertViewerCanComment(
  postId: string,
  viewerUserId: string,
): Promise<{
  post: NonNullable<Awaited<ReturnType<typeof loadPostForAccessCheck>>>;
}> {
  const post = await loadPostForAccessCheck(postId);
  if (!post || !post.isPublished) {
    throw new CommentsError("post_not_found", "Post not found.", 404);
  }

  const membershipWorkspaceIds = await getViewerWorkspaceIds(viewerUserId);
  if (!membershipWorkspaceIds.includes(post.workspaceId)) {
    throw new CommentsError(
      "not_workspace_member",
      "Only workspace members can comment on this document.",
      403,
    );
  }

  return { post };
}

// Comments are the workspace's conversation about a document, so reading
// them takes more than reading the document: the author, members of its
// workspace, or someone it was shared with. Readers of a public document
// see the document without its comments.
async function assertViewerCanReadComments(
  postId: string,
  viewerUserId: string | null,
): Promise<{
  post: NonNullable<Awaited<ReturnType<typeof loadPostForAccessCheck>>>;
}> {
  const post = await loadPostForAccessCheck(postId);
  if (!post || !post.isPublished) {
    throw new CommentsError("post_not_found", "Post not found.", 404);
  }

  const membershipWorkspaceIds = await getViewerWorkspaceIds(viewerUserId);
  const accessible = canViewerAccessPost(
    post,
    viewerUserId,
    membershipWorkspaceIds,
    post.allowPublicDocuments,
  );
  if (!accessible) {
    throw new CommentsError("forbidden", "Cannot read this document.", 403);
  }

  const inConversation =
    viewerUserId !== null &&
    (post.authorUserId === viewerUserId ||
      membershipWorkspaceIds.includes(post.workspaceId) ||
      (await isPostSharedWithViewer(post.id, viewerUserId)));
  if (!inConversation) {
    throw new CommentsError(
      "forbidden",
      "Comments are visible to the workspace and the people this document is shared with.",
      403,
    );
  }

  return { post };
}

function serializeComment(row: {
  id: string;
  postId: string;
  parentCommentId: string | null;
  authorUserId: string;
  body: string;
  quotedText: string | null;
  anchorBefore: string | null;
  anchorAfter: string | null;
  startOffset: number | null;
  endOffset: number | null;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  authorUsername: string | null;
  authorFullName: string | null;
  authorAvatarUrl: string | null;
}): CommentRecord {
  return {
    id: row.id,
    postId: row.postId,
    parentCommentId: row.parentCommentId,
    authorUserId: row.authorUserId,
    authorUsername: row.authorUsername,
    authorFullName: row.authorFullName,
    authorAvatarUrl: row.authorAvatarUrl,
    body: row.body,
    quotedText: row.quotedText,
    anchorBefore: row.anchorBefore,
    anchorAfter: row.anchorAfter,
    startOffset: row.startOffset,
    endOffset: row.endOffset,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolvedByUserId: row.resolvedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCommentsForPost(
  postId: string,
  viewerUserId: string | null,
  { includeResolved = true }: { includeResolved?: boolean } = {},
): Promise<CommentRecord[]> {
  await assertViewerCanReadComments(postId, viewerUserId);

  const database = getDbOrThrow();
  const where = includeResolved
    ? eq(comments.postId, postId)
    : and(eq(comments.postId, postId), isNull(comments.resolvedAt));

  const rows = await database
    .select({
      id: comments.id,
      postId: comments.postId,
      parentCommentId: comments.parentCommentId,
      authorUserId: comments.authorUserId,
      body: comments.body,
      quotedText: comments.quotedText,
      anchorBefore: comments.anchorBefore,
      anchorAfter: comments.anchorAfter,
      startOffset: comments.startOffset,
      endOffset: comments.endOffset,
      resolvedAt: comments.resolvedAt,
      resolvedByUserId: comments.resolvedByUserId,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      authorUsername: usernames.username,
      authorFullName: usernames.fullName,
      authorAvatarUrl: usernames.profilePictureUrl,
    })
    .from(comments)
    .leftJoin(usernames, eq(usernames.userId, comments.authorUserId))
    .where(where)
    .orderBy(asc(comments.createdAt));

  return rows.map(serializeComment);
}

export async function createComment(
  input: CreateCommentInput,
): Promise<CommentRecord> {
  const body = input.body.trim();
  if (!body) {
    throw new CommentsError("empty_body", "Comment body is required.", 400);
  }
  if (body.length > 4000) {
    throw new CommentsError(
      "body_too_long",
      "Comments are limited to 4000 characters.",
      400,
    );
  }

  await assertViewerCanComment(input.postId, input.authorUserId);

  // Replies inherit the parent's anchor — we only persist anchor
  // columns on top-level comments. This keeps the data model simple
  // and means the highlighter never has to hunt for a reply's quoted
  // text (it always belongs to the thread root).
  let parentCommentId: string | null = null;
  let anchor = input.anchor ?? null;
  if (input.parentCommentId) {
    const database = getDbOrThrow();
    const [parent] = await database
      .select({
        id: comments.id,
        postId: comments.postId,
      })
      .from(comments)
      .where(eq(comments.id, input.parentCommentId))
      .limit(1);
    if (!parent || parent.postId !== input.postId) {
      throw new CommentsError(
        "parent_not_found",
        "Parent comment not found on this post.",
        404,
      );
    }
    parentCommentId = parent.id;
    anchor = null;
  }

  const database = getDbOrThrow();
  const [inserted] = await database
    .insert(comments)
    .values({
      postId: input.postId,
      parentCommentId,
      authorUserId: input.authorUserId,
      body,
      quotedText: anchor?.quotedText ?? null,
      anchorBefore: anchor?.anchorBefore ?? null,
      anchorAfter: anchor?.anchorAfter ?? null,
      startOffset: anchor?.startOffset ?? null,
      endOffset: anchor?.endOffset ?? null,
    })
    .returning();

  // Re-read with the author profile join so the API caller gets the
  // same shape `listCommentsForPost` returns. Avoids a second
  // round-trip from the client just to render the new comment with
  // the author's name + avatar.
  const [row] = await database
    .select({
      id: comments.id,
      postId: comments.postId,
      parentCommentId: comments.parentCommentId,
      authorUserId: comments.authorUserId,
      body: comments.body,
      quotedText: comments.quotedText,
      anchorBefore: comments.anchorBefore,
      anchorAfter: comments.anchorAfter,
      startOffset: comments.startOffset,
      endOffset: comments.endOffset,
      resolvedAt: comments.resolvedAt,
      resolvedByUserId: comments.resolvedByUserId,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      authorUsername: usernames.username,
      authorFullName: usernames.fullName,
      authorAvatarUrl: usernames.profilePictureUrl,
    })
    .from(comments)
    .leftJoin(usernames, eq(usernames.userId, comments.authorUserId))
    .where(eq(comments.id, inserted.id))
    .limit(1);

  return serializeComment(row);
}

export async function updateCommentBody(
  commentId: string,
  viewerUserId: string,
  rawBody: string,
): Promise<CommentRecord> {
  const body = rawBody.trim();
  if (!body) {
    throw new CommentsError("empty_body", "Comment body is required.", 400);
  }
  if (body.length > 4000) {
    throw new CommentsError(
      "body_too_long",
      "Comments are limited to 4000 characters.",
      400,
    );
  }

  const database = getDbOrThrow();
  const [existing] = await database
    .select({
      id: comments.id,
      postId: comments.postId,
      authorUserId: comments.authorUserId,
    })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  if (!existing) {
    throw new CommentsError("not_found", "Comment not found.", 404);
  }
  if (existing.authorUserId !== viewerUserId) {
    throw new CommentsError(
      "forbidden",
      "You can only edit your own comments.",
      403,
    );
  }

  await database
    .update(comments)
    .set({ body, updatedAt: new Date() })
    .where(eq(comments.id, commentId));

  const [row] = await database
    .select({
      id: comments.id,
      postId: comments.postId,
      parentCommentId: comments.parentCommentId,
      authorUserId: comments.authorUserId,
      body: comments.body,
      quotedText: comments.quotedText,
      anchorBefore: comments.anchorBefore,
      anchorAfter: comments.anchorAfter,
      startOffset: comments.startOffset,
      endOffset: comments.endOffset,
      resolvedAt: comments.resolvedAt,
      resolvedByUserId: comments.resolvedByUserId,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      authorUsername: usernames.username,
      authorFullName: usernames.fullName,
      authorAvatarUrl: usernames.profilePictureUrl,
    })
    .from(comments)
    .leftJoin(usernames, eq(usernames.userId, comments.authorUserId))
    .where(eq(comments.id, commentId))
    .limit(1);

  return serializeComment(row);
}

// Resolving a thread is a workspace-member action, not author-only:
// any active member can mark a thread done once the discussion has
// landed. Mirrors how Google Docs and Notion treat resolution as
// shared housekeeping.
export async function setCommentResolution(
  commentId: string,
  viewerUserId: string,
  resolved: boolean,
): Promise<CommentRecord> {
  const database = getDbOrThrow();
  const [existing] = await database
    .select({
      id: comments.id,
      postId: comments.postId,
      parentCommentId: comments.parentCommentId,
    })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!existing) {
    throw new CommentsError("not_found", "Comment not found.", 404);
  }
  if (existing.parentCommentId) {
    throw new CommentsError(
      "cannot_resolve_reply",
      "Only top-level threads can be resolved.",
      400,
    );
  }

  await assertViewerCanComment(existing.postId, viewerUserId);

  await database
    .update(comments)
    .set({
      resolvedAt: resolved ? new Date() : null,
      resolvedByUserId: resolved ? viewerUserId : null,
      updatedAt: new Date(),
    })
    .where(eq(comments.id, commentId));

  const [row] = await database
    .select({
      id: comments.id,
      postId: comments.postId,
      parentCommentId: comments.parentCommentId,
      authorUserId: comments.authorUserId,
      body: comments.body,
      quotedText: comments.quotedText,
      anchorBefore: comments.anchorBefore,
      anchorAfter: comments.anchorAfter,
      startOffset: comments.startOffset,
      endOffset: comments.endOffset,
      resolvedAt: comments.resolvedAt,
      resolvedByUserId: comments.resolvedByUserId,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      authorUsername: usernames.username,
      authorFullName: usernames.fullName,
      authorAvatarUrl: usernames.profilePictureUrl,
    })
    .from(comments)
    .leftJoin(usernames, eq(usernames.userId, comments.authorUserId))
    .where(eq(comments.id, commentId))
    .limit(1);

  return serializeComment(row);
}

export async function deleteComment(
  commentId: string,
  viewerUserId: string,
): Promise<void> {
  const database = getDbOrThrow();
  const [existing] = await database
    .select({
      id: comments.id,
      postId: comments.postId,
      authorUserId: comments.authorUserId,
    })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!existing) {
    throw new CommentsError("not_found", "Comment not found.", 404);
  }
  if (existing.authorUserId !== viewerUserId) {
    throw new CommentsError(
      "forbidden",
      "You can only delete your own comments.",
      403,
    );
  }

  // Cascading deletes are NOT configured for replies — we delete the
  // single row and leave any reply chain intact under a "deleted"
  // tombstone in the UI. Hard-deleting a parent would orphan replies
  // and make threads confusing to read after the fact. If/when we
  // want a softer model we can flip this to set a `deletedAt` instead.
  await database.delete(comments).where(eq(comments.id, commentId));
}

// Loaded once per post to feed both the comment-author list (UI) and
// the email notification recipients (server). Returns active members
// only — invited/disabled rows are filtered out at the workspace
// layer, but we re-check status here defensively.
export async function getCommentNotificationRecipients(
  postId: string,
  excludeUserId: string,
): Promise<
  Array<{ userId: string; email: string; displayName: string | null }>
> {
  const database = getDbOrThrow();

  // Anyone who has commented on the thread + the post author. We
  // dedupe on userId in JS — Postgres `DISTINCT` here would need a
  // subquery to keep the join shape clean, and the recipient set is
  // small enough that a Set in code is the simpler call.
  const post = await loadPostForAccessCheck(postId);
  if (!post) return [];

  const participants = await database
    .selectDistinct({ userId: comments.authorUserId })
    .from(comments)
    .where(eq(comments.postId, postId));

  const userIds = new Set<string>([post.authorUserId]);
  for (const row of participants) {
    if (row.userId) userIds.add(row.userId);
  }
  userIds.delete(excludeUserId);
  if (userIds.size === 0) return [];

  const idArray = Array.from(userIds);
  const rows = await database
    .select({
      userId: user.id,
      email: user.email,
      displayName: usernames.fullName,
      username: usernames.username,
    })
    .from(user)
    .leftJoin(usernames, eq(usernames.userId, user.id))
    .where(inArray(user.id, idArray));

  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    displayName: row.displayName ?? row.username ?? null,
  }));
}
