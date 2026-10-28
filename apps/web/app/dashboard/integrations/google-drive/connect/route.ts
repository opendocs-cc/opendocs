import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { getServerSession } from "@/lib/auth/session";
import { buildGoogleDriveAuthUrl, isGoogleDriveConfigured } from "@opendocs/shared/integrations/google-drive";
import { isServiceError, requireIntegrationAccess, webAppUrl } from "@opendocs/shared/integrations/service";

import { getActiveWorkspaceId } from "../../workspace";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, driveRedirectUri } from "../oauth";

/** Start connecting Google Drive to the active workspace (owners and admins). */
export async function GET(request: NextRequest) {
  const back = new URL("/dashboard/integrations", webAppUrl());
  const session = await getServerSession();
  if (!session) return NextResponse.redirect(new URL("/login", webAppUrl()));

  const workspaceId = await getActiveWorkspaceId(session.user.id);
  if (!workspaceId) return NextResponse.redirect(back);
  const access = await requireIntegrationAccess(session.user.id, workspaceId, "manage");
  if (isServiceError(access)) {
    back.searchParams.set("error", access.error);
    return NextResponse.redirect(back);
  }
  if (!isGoogleDriveConfigured()) {
    back.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(back);
  }

  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(buildGoogleDriveAuthUrl({ redirectUri: driveRedirectUri(), state }));
  response.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, workspaceId }), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: OAUTH_COOKIE_PATH,
    maxAge: 10 * 60,
  });
  return response;
}
