import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";

import { requireServerSession } from "@/lib/auth/session";
import {
  getTeamMembers,
  getTeamStats,
  getPendingInvitations,
  getWorkspaceSettings,
  getUserWorkspaces,
} from "@/lib/workspaces/cached";

import { TeamClient } from "./team-client";

export const metadata: Metadata = { title: "Team" };

function TeamSkeleton() {
  return (
    <div className="w-full min-h-full">
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="md:w-[280px] shrink-0">
            <div className="h-[30px] bg-gray-100 rounded w-24 animate-pulse" />
            <div className="h-[20px] bg-gray-100 rounded w-48 animate-pulse mt-3" />
          </div>
          <div className="flex-1">
            <div className="bg-white rounded-xl border border-[#e5e5e5] p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-10 bg-gray-100 rounded" />
                <div className="h-10 bg-gray-100 rounded" />
                <div className="h-32 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function TeamContent() {
  const session = await requireServerSession();

  // Resolve active workspace from cookie
  const cookieStore = await cookies();
  const activeWsCookie = cookieStore.get("active_workspace_id")?.value;
  const allWorkspaces = await getUserWorkspaces(session.user.id);
  const activeWorkspaceId =
    activeWsCookie && allWorkspaces.some((w) => w.workspaceId === activeWsCookie)
      ? activeWsCookie
      : allWorkspaces[0]?.workspaceId;

  const [members, stats, invitations, settings] = await Promise.all([
    getTeamMembers(session.user.id, activeWorkspaceId),
    getTeamStats(session.user.id, activeWorkspaceId),
    getPendingInvitations(session.user.id, activeWorkspaceId),
    getWorkspaceSettings(session.user.id, activeWorkspaceId),
  ]);

  if (!members || !stats) {
    return (
      <div className="w-full min-h-full">
        <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10">
          <h1 className="text-[20px] font-semibold text-[#171717]">Team</h1>
          <p className="text-[16px] text-[#525252] mt-1">
            No workspace found. Please complete onboarding first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <TeamClient
      currentUserId={session.user.id}
      currentUserRole={settings?.role ?? "member"}
      workspaceId={activeWorkspaceId ?? ""}
      members={members}
      invitations={(invitations ?? []).map((inv) => ({
        ...inv,
        role: inv.role as "admin" | "member",
      }))}
      stats={stats}
    />
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={<TeamSkeleton />}>
      <TeamContent />
    </Suspense>
  );
}
