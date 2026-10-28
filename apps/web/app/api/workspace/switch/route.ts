import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { requireServerSession } from "@/lib/auth/session";
import { getUserWorkspaces } from "@/lib/workspaces/cached";

export const dynamic = "force-dynamic";

/**
 * POST /api/workspace/switch
 * Sets the active_workspace_id cookie to the given workspace ID,
 * provided the user is a member of that workspace.
 */
export async function POST(req: NextRequest) {
  const session = await requireServerSession();
  const body = await req.json().catch(() => ({}));
  const { workspaceId } = body as { workspaceId?: string };

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  // Verify the user is a member of the workspace
  const userWorkspaces = await getUserWorkspaces(session.user.id);
  const target = userWorkspaces.find((w) => w.workspaceId === workspaceId);

  if (!target) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set("active_workspace_id", workspaceId, {
    path: "/",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return NextResponse.json({ success: true, workspace: target });
}
