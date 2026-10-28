import { NextResponse } from "next/server";

import { listPublicWorkspacePaths } from "@opendocs/shared/custom-domains/service";

import { getSiteContext } from "@/lib/site-context";
import { canonicalUrl, isCustomSite } from "@/lib/site-paths";

export const dynamic = "force-dynamic";

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * /sitemap.xml on a custom domain (the middleware rewrites it here): the
 * workspace page, its projects and public documents, all on this host. A
 * sitemap may only list its own host, so opendocs.cc's sitemap never lists
 * these.
 */
export async function GET() {
  const site = await getSiteContext();
  if (!isCustomSite(site)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { documents, projects } = await listPublicWorkspacePaths(site.workspaceId);
  const latest = documents[0]?.updatedAt;
  // Nothing public, nothing listed (robots.txt disallows the whole host).
  const entries =
    documents.length === 0
      ? []
      : [
          { loc: site.origin, lastmod: latest },
          ...projects.map((project) => ({ loc: canonicalUrl(site, project.path), lastmod: project.updatedAt })),
          ...documents.map((doc) => ({ loc: canonicalUrl(site, doc.path), lastmod: doc.updatedAt })),
        ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (entry) =>
      `  <url><loc>${escapeXml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod.toISOString()}</lastmod>` : ""}</url>`,
  )
  .join("\n")}
</urlset>
`;
  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
