import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getInvitationLandingState } from "@/lib/workspaces/cached";

/**
 * Sets the pending_invite_token cookie and redirects to login/signup.
 * Cookies can only be set in a Route Handler or Server Action in Next.js 15,
 * so the invite page redirects here when the user is not logged in.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const inviteState = await getInvitationLandingState(token);

  if (inviteState.status !== "valid") {
    return NextResponse.redirect(new URL(`/invite/${token}`, baseUrl));
  }

  const cookieStore = await cookies();
  cookieStore.set("pending_invite_token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600, // 1 hour
    secure: process.env.NODE_ENV === "production",
  });

  const redirectTarget = encodeURIComponent("/api/invite/accept");
  const authPath = inviteState.existingUser ? "/login" : "/signup";

  return NextResponse.redirect(
    new URL(`${authPath}?redirect=${redirectTarget}`, baseUrl),
  );
}
