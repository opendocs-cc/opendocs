import { NextResponse, type NextRequest } from "next/server";

import { openDocsWebUrl, safeReturnPath } from "@opendocs/shared/custom-domains/urls";

import { REDIRECT_HEADER } from "@/lib/site-paths";

export const dynamic = "force-dynamic";

/**
 * /_opendocs/redirect: a 302 to a path on opendocs.cc. The middleware
 * rewrites app paths (/dashboard, /login…) and paused custom domains here,
 * with the path in a request header that it strips from every incoming
 * request; see redirectToOpenDocs in middleware.ts for why it isn't a
 * middleware redirect. Only relative paths, and only to the OpenDocs app,
 * so it can't send anyone elsewhere.
 */
export function GET(request: NextRequest) {
  const path = safeReturnPath(request.headers.get(REDIRECT_HEADER)) ?? "/";
  const response = NextResponse.redirect(`${openDocsWebUrl()}${path}`, 302);
  response.headers.set("cache-control", "no-store");
  return response;
}
