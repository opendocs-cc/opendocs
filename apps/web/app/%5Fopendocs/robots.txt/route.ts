import { NextResponse } from "next/server";

import { listPublicWorkspacePaths } from "@opendocs/shared/custom-domains/service";

import { getSiteContext } from "@/lib/site-context";
import { isCustomSite } from "@/lib/site-paths";

export const dynamic = "force-dynamic";

/**
 * /robots.txt on a custom domain (the middleware rewrites it here). A
 * workspace with public documents may be crawled, except the sign-in
 * bridge, and lists its own sitemap. One without any (a private workspace,
 * or public documents turned off) asks crawlers to stay away entirely:
 * there's nothing for them, only sign-in redirects.
 */
export async function GET() {
  const site = await getSiteContext();
  if (!isCustomSite(site)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { documents } = await listPublicWorkspacePaths(site.workspaceId);
  const body =
    documents.length > 0
      ? `User-Agent: *
Allow: /
Disallow: /_opendocs/
Disallow: /api/

Sitemap: ${site.origin}/sitemap.xml
`
      : `User-Agent: *
Disallow: /
`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
