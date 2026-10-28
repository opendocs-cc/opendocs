import { NextResponse, type NextRequest } from "next/server";

import { AGENT_DOCS_MARKDOWN } from "@/lib/agent-docs";

const HUMAN_DOCS_URL = "https://docs.opendocs.cc";

/**
 * `/docs` and `/docs/*`. Browsers are redirected to the docs site (the
 * marketing pages link here, and the docs site serves pages at its root,
 * so /docs/cli/reference → docs.opendocs.cc/cli/reference). Agents and
 * `curl` — anything not asking for HTML — get the markdown agent guide at
 * `/docs`, like here.now's "agent mode".
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await params;
  const wantsHtml = (request.headers.get("accept") ?? "").includes("text/html");

  if (path.length === 0 && !wantsHtml) {
    return new NextResponse(AGENT_DOCS_MARKDOWN, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        Vary: "Accept",
      },
    });
  }

  const target = new URL(`/${path.map(encodeURIComponent).join("/")}`, HUMAN_DOCS_URL);
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target, 308);
}
