import { NextRequest, NextResponse } from "next/server";

import { getReaderSession } from "@/lib/auth/session";
import { getSiteContext } from "@/lib/site-context";
import { isCustomSite, workspaceHref } from "@/lib/site-paths";
import { getWorkspaceSearchIndex } from "@/lib/workspaces/cached";

/**
 * `force-dynamic` because the response body is access-filtered: a
 * signed-in workspace member sees workspace+restricted posts the
 * anonymous viewer shouldn't. Caching would conflate audiences.
 */
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ workspace: string }>;
};

/**
 * GET /api/workspace/:workspace/search-index
 *
 * Returns the compact in-memory search index for the given workspace —
 * the payload the `<WorkspaceSearch>` dialog indexes on the client.
 * Fetched lazily the first time a viewer opens the dialog (not on
 * every page load) and cached in-memory for the rest of the tab
 * session, so scrolling and navigating between docs is free.
 *
 * Response shape mirrors `getWorkspaceSearchIndex()`:
 *   { items: Array<{...}>, tagColorIndex: Record<string, number> }
 *
 * Unknown workspace slug returns `{ items: [], tagColorIndex: {} }`
 * with a 200 — matches the service function's shape and lets the
 * client treat missing workspaces as "empty search results" rather
 * than a hard error. The underlying service also silently filters
 * posts the viewer can't see, so a signed-out visitor hitting this
 * endpoint for a private workspace gets the same empty payload.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { workspace } = await ctx.params;
  const [session, site] = await Promise.all([getReaderSession(), getSiteContext()]);
  // A custom domain searches its own workspace only, and its results
  // link to that domain.
  if (isCustomSite(site) && workspace.toLowerCase() !== site.workspaceSlug) {
    return NextResponse.json({ items: [], tagColorIndex: {} });
  }
  const index = await getWorkspaceSearchIndex(
    workspace,
    session?.user.id ?? null,
  );
  if (!isCustomSite(site)) return NextResponse.json(index);
  return NextResponse.json({
    ...index,
    items: index.items.map((item) => ({ ...item, url: workspaceHref(site, item.url) })),
  });
}
