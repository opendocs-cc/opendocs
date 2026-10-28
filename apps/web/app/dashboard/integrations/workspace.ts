import "server-only";

import { cookies } from "next/headers";

import { getUserWorkspaces } from "@/lib/workspaces/cached";

/** The dashboard's active workspace: the cookie when it's one of the user's, else the first. */
export async function getActiveWorkspaceId(userId: string): Promise<string | undefined> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get("active_workspace_id")?.value;
  const workspaces = await getUserWorkspaces(userId);
  return fromCookie && workspaces.some((w) => w.workspaceId === fromCookie)
    ? fromCookie
    : workspaces[0]?.workspaceId;
}
