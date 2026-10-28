import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/session";
import { acceptInvitation, getOnboardingState } from "@/lib/workspaces/cached";

export const dynamic = "force-dynamic";

/**
 * Processes the pending_invite_token cookie, accepts the invitation,
 * deletes the cookie, and redirects appropriately.
 *
 * Cookies can only be modified in a Route Handler or Server Action in Next.js 15,
 * so the onboarding page redirects here when a pending invite cookie exists.
 */
export async function GET() {
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const session = await getServerSession();

  if (!session) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  const cookieStore = await cookies();
  const inviteCookie = cookieStore.get("pending_invite_token");
  let joinedWorkspaceId: string | null = null;

  if (inviteCookie?.value) {
    try {
      const result = await acceptInvitation(session.user.id, inviteCookie.value);
      if (!("error" in result) && result.workspaceId) {
        joinedWorkspaceId = result.workspaceId;
      } else if ("error" in result) {
        cookieStore.delete("pending_invite_token");
        return NextResponse.redirect(new URL(`/invite/${inviteCookie.value}`, baseUrl));
      }
    } catch {
      cookieStore.delete("pending_invite_token");
      return NextResponse.redirect(new URL(`/invite/${inviteCookie.value}`, baseUrl));
    }

    cookieStore.delete("pending_invite_token");
  }

  // If the user joined a workspace, set it as the active workspace
  if (joinedWorkspaceId) {
    cookieStore.set("active_workspace_id", joinedWorkspaceId, {
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  // Check if they still need onboarding (e.g. username)
  const onboarding = await getOnboardingState(session.user.id);

  if (onboarding.completed) {
    return NextResponse.redirect(new URL("/dashboard", baseUrl));
  }

  return NextResponse.redirect(new URL("/onboarding", baseUrl));
}
