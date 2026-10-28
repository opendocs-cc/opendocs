import { eq } from "drizzle-orm";

import { getDbOrThrow } from "@opendocs/shared/db/guards";
import { comments, posts } from "@opendocs/shared/db/schema";

import { getSiteContext } from "@/lib/site-context";
import { isCustomSite } from "@/lib/site-paths";

/**
 * On a custom domain the comment routes only touch documents of the
 * workspace that owns the domain, even if the reader could comment
 * elsewhere: each domain is its own site. Always true on opendocs.cc.
 */
export async function isPostOnCurrentSite(postId: string): Promise<boolean> {
  const site = await getSiteContext();
  if (!isCustomSite(site)) return true;
  const [row] = await getDbOrThrow()
    .select({ workspaceId: posts.workspaceId })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  return row?.workspaceId === site.workspaceId;
}

export async function isCommentOnCurrentSite(commentId: string): Promise<boolean> {
  const site = await getSiteContext();
  if (!isCustomSite(site)) return true;
  const [row] = await getDbOrThrow()
    .select({ workspaceId: posts.workspaceId })
    .from(comments)
    .innerJoin(posts, eq(posts.id, comments.postId))
    .where(eq(comments.id, commentId))
    .limit(1);
  return row?.workspaceId === site.workspaceId;
}

/**
 * On a custom domain, writes (new comments, edits, resolving, deleting)
 * must come from the domain's own pages. The viewer cookie is
 * SameSite=Lax, and every host under the same registrable domain counts as
 * the same site: without this, a page on blog.example.com could post as a
 * reader of notes.example.com. Browsers send Origin on these requests; a
 * JSON body is required too, so a plain HTML form can't stand in.
 */
export async function isForeignWrite(request: Request): Promise<boolean> {
  const site = await getSiteContext();
  if (!isCustomSite(site)) return false;
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== site.origin) return true;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return true;
  if (request.method !== "DELETE" && !request.headers.get("content-type")?.startsWith("application/json")) {
    return true;
  }
  return false;
}
