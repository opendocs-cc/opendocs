import { NextResponse, type NextRequest } from "next/server";

import { openDocsWebUrl, safeReturnPath } from "@opendocs/shared/custom-domains/urls";

import { getServerSession } from "@/lib/auth/session";
import { getUserWorkspaces } from "@/lib/workspaces/cached";

export const dynamic = "force-dynamic";

/**
 * GET /dashboard/open?workspace=<id>&to=/dashboard/documents
 *
 * A link into the dashboard for one workspace, for pages that know which
 * workspace the reader was looking at (the account menu on its reader pages
 * and custom domain). Makes it the active workspace, if the user is a
 * member, then goes to `to` (a dashboard path; the home by default).
 * Signed-out readers sign in first and come back here.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workspaceId = params.get("workspace");
  const requested = safeReturnPath(params.get("to"));
  const to = requested && (requested === "/dashboard" || requested.startsWith("/dashboard/")) ? requested : "/dashboard";

  const session = await getServerSession();
  if (!session) {
    const back = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(`${openDocsWebUrl()}/login?redirect=${encodeURIComponent(back)}`, 303);
  }

  const response = NextResponse.redirect(`${openDocsWebUrl()}${to}`, 303);
  if (workspaceId) {
    const workspaces = await getUserWorkspaces(session.user.id);
    if (workspaces.some((workspace) => workspace.workspaceId === workspaceId)) {
      response.cookies.set("active_workspace_id", workspaceId, {
        path: "/",
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }
  response.headers.set("cache-control", "no-store");
  return response;
}
