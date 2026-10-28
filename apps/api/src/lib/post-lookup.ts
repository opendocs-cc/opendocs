import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";

import { posts, workspaces } from "@opendocs/shared/db/schema";
import { getDbOrThrow } from "@opendocs/shared/db/guards";
import { isPostSharedWithViewer } from "@opendocs/shared/posts/sharing";
import {
  canViewerAccessPost,
  getManagedWorkspaceIds,
  getViewerWorkspaceIds,
} from "@opendocs/shared/workspaces/service";

// UUID v4 from crypto.randomUUID() has a fixed shape: 8-4-4-4-12 hex groups
// with the `4` and `[89ab]` nibbles in positions 14 and 19. We don't need to
// be strict about the version/variant bits here — any 8-4-4-4-12 hex string
// is treated as a UUID because the slug namespace is stricter (slugify with
// `lower: true, strict: true` emits only `[a-z0-9-]+`, no uppercase hex), so
// the two namespaces don't overlap in practice. Matching a little loosely is
// fine; a user would have to deliberately craft a 36-char slug of `[a-f0-9-]`
// in the exact UUID shape to collide, and the dashes at the right positions
// can't be created by a normal title → slug derivation.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export type AccessiblePost = {
  id: string;
  slug: string;
  authorUserId: string;
  workspaceId: string;
  visibility: "private" | "workspace" | "restricted_email" | "public";
  allowPublicDocuments: boolean;
  /**
   * The caller wrote the document or is an active member of its workspace,
   * i.e. may edit it and gets the full source (```private blocks included).
   * Guests reading through a share or a public link don't.
   */
  viewerIsMember: boolean;
};

/**
 * Resolve a postId-or-slug to a document the caller can read.
 *
 * Every `/posts/:postId` route goes through this, so reading and changing
 * a document share one access rule: the author, members of the document's
 * workspace (for workspace and public documents; private ones stay with
 * their author), guests it was shared with, and anyone for a public
 * document in a workspace that allows them (`canViewerAccessPost`).
 * Unpublished documents are offline, so only their author and the
 * workspace's owners and admins reach them. What a
 * reader may then *do* (edit, retag, change visibility, delete…) is
 * checked by the services (`assertCanEditWorkspacePost`,
 * `assertCanManageWorkspacePost`). Returns `null` when the caller can't
 * read it; routes answer 404 so private documents don't leak.
 *
 * UUIDs are globally unique, so they're looked up on their own: scoping
 * them by workspace would turn a stale active workspace into a spurious
 * 404. Slugs are only unique per project, so they resolve inside the
 * `workspaceId` (and `projectId`) the CLI sends. Without a workspace,
 * slugs resolve inside the caller's own workspaces and documents, never
 * another tenant's. When several documents match (same slug in two
 * projects), the caller's own wins, then the most recently updated.
 */
export async function findAccessiblePost(
  userId: string,
  postIdOrSlug: string,
  workspaceId?: string,
  projectId?: string,
): Promise<AccessiblePost | null> {
  const db = getDbOrThrow();
  const [memberWorkspaceIds, managedWorkspaceIds] = await Promise.all([
    getViewerWorkspaceIds(userId),
    getManagedWorkspaceIds(userId),
  ]);

  const clauses = [];
  if (isUuid(postIdOrSlug)) {
    clauses.push(eq(posts.id, postIdOrSlug));
  } else {
    clauses.push(eq(posts.slug, postIdOrSlug));
    if (projectId) clauses.push(eq(posts.projectId, projectId));
    if (workspaceId) {
      clauses.push(eq(posts.workspaceId, workspaceId));
    } else {
      clauses.push(
        memberWorkspaceIds.length > 0
          ? or(eq(posts.authorUserId, userId), inArray(posts.workspaceId, memberWorkspaceIds))!
          : eq(posts.authorUserId, userId),
      );
    }
  }

  const candidates = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      authorUserId: posts.authorUserId,
      workspaceId: posts.workspaceId,
      visibility: posts.visibility,
      isPublished: posts.isPublished,
      allowPublicDocuments: workspaces.allowPublicDocuments,
    })
    .from(posts)
    .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
    .where(and(...clauses))
    .orderBy(sql`${posts.authorUserId} = ${userId} desc`, desc(posts.updatedAt))
    .limit(10);

  for (const candidate of candidates) {
    // An unpublished document is offline: only its author and the
    // workspace's owners and admins (who can delete it) still reach it.
    if (
      !candidate.isPublished &&
      candidate.authorUserId !== userId &&
      !managedWorkspaceIds.includes(candidate.workspaceId)
    ) {
      continue;
    }
    const readable =
      canViewerAccessPost(
        candidate,
        userId,
        memberWorkspaceIds,
        candidate.allowPublicDocuments,
      ) || (await isPostSharedWithViewer(candidate.id, userId));
    if (readable) {
      return {
        ...candidate,
        viewerIsMember:
          candidate.authorUserId === userId ||
          memberWorkspaceIds.includes(candidate.workspaceId),
      };
    }
  }
  return null;
}

/**
 * Find the workspace slug of a different workspace where the user has
 * authored a post with the given slug.
 *
 * Used to enrich the 404 message when `findAccessiblePost(userId, slug, wsA)`
 * misses but the slug exists in some other workspace the user has
 * authored in. Returns the workspace slug of that other workspace, or
 * `null` when no alternate exists.
 *
 * Matches multiple other workspaces? We only surface one — the hint is
 * an escape hatch for "you're in the wrong workspace", so naming any
 * valid alternate is enough to unstick the user. A follow-up
 * `opendocs list --all` reveals the rest.
 */
export async function findSlugInOtherWorkspace(
  userId: string,
  slug: string,
  excludeWorkspaceId: string,
): Promise<string | null> {
  const db = getDbOrThrow();
  const [row] = await db
    .select({ workspaceSlug: workspaces.slug })
    .from(posts)
    .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
    .where(
      and(
        eq(posts.authorUserId, userId),
        eq(posts.slug, slug),
        ne(posts.workspaceId, excludeWorkspaceId),
      ),
    )
    .limit(1);

  return row?.workspaceSlug ?? null;
}
