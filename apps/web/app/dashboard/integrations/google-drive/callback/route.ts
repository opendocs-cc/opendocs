import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { getServerSession } from "@/lib/auth/session";
import { completeGoogleDriveConnection } from "@opendocs/shared/integrations/connections";
import { isServiceError, webAppUrl } from "@opendocs/shared/integrations/service";

import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, driveRedirectUri } from "../oauth";

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Google sends people back here after they allow (or refuse) Drive access. */
export async function GET(request: NextRequest) {
  const back = new URL("/dashboard/integrations", webAppUrl());
  const finish = (params: Record<string, string>) => {
    for (const [k, v] of Object.entries(params)) back.searchParams.set(k, v);
    const response = NextResponse.redirect(back);
    response.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return response;
  };

  const session = await getServerSession();
  if (!session) return NextResponse.redirect(new URL("/login", webAppUrl()));

  let saved: { state?: string; workspaceId?: string } = {};
  try {
    saved = JSON.parse(request.cookies.get(OAUTH_COOKIE)?.value ?? "{}");
  } catch {
    saved = {};
  }
  const state = request.nextUrl.searchParams.get("state") ?? "";
  if (!saved.state || !saved.workspaceId || !sameState(state, saved.state)) {
    return finish({ error: "oauth_state" });
  }
  if (request.nextUrl.searchParams.get("error")) return finish({ error: "google_denied" });
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return finish({ error: "google_denied" });

  const result = await completeGoogleDriveConnection(session.user.id, saved.workspaceId, {
    code,
    redirectUri: driveRedirectUri(),
  });
  if (isServiceError(result)) return finish({ error: result.error });
  revalidatePath("/dashboard/integrations");
  return finish({ connected: "google_drive" });
}
