import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";

import { requireServerSession } from "@/lib/auth/session";
import {
  getWorkspaceSettings,
  getUserWorkspaces,
  getEffectiveWorkspaceTier,
  getWorkspaceDeletionPreview,
} from "@/lib/workspaces/cached";

import { WorkspaceClient } from "./workspace-client";

export const metadata: Metadata = { title: "Workspace settings" };

function WorkspaceSkeleton() {
  return (
    <div className="w-full min-h-full">
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">
        <div className="flex flex-col gap-0.5">
          <div className="h-[30px] bg-gray-100 rounded w-56 animate-pulse" />
          <div className="h-[24px] bg-gray-100 rounded w-80 animate-pulse mt-2" />
        </div>
        <div className="bg-white rounded-xl border border-[#e5e5e5] p-6">
          <div className="animate-pulse space-y-6">
            <div className="flex gap-8">
              <div className="w-[280px] shrink-0">
                <div className="h-4 bg-gray-100 rounded w-32" />
              </div>
              <div className="flex-1">
                <div className="h-10 bg-gray-100 rounded w-full" />
              </div>
            </div>
            <div className="h-px bg-[#e5e5e5]" />
            <div className="flex gap-8">
              <div className="w-[280px] shrink-0">
                <div className="h-4 bg-gray-100 rounded w-40" />
              </div>
              <div className="flex-1">
                <div className="h-10 bg-gray-100 rounded w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function WorkspaceContent() {
  const session = await requireServerSession();

  // Resolve active workspace from cookie
  const cookieStore = await cookies();
  const activeWsCookie = cookieStore.get("active_workspace_id")?.value;
  const allWorkspaces = await getUserWorkspaces(session.user.id);
  const activeWorkspaceId =
    activeWsCookie && allWorkspaces.some((w) => w.workspaceId === activeWsCookie)
      ? activeWsCookie
      : allWorkspaces[0]?.workspaceId;

  const settings = await getWorkspaceSettings(session.user.id, activeWorkspaceId);

  if (!settings) {
    return (
      <div className="w-full min-h-full">
        <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10">
          <h1 className="text-[20px] font-semibold text-[#171717]">Workspace settings</h1>
          <p className="text-[16px] text-[#525252] mt-1">
            No workspace found. Please complete onboarding first.
          </p>
        </div>
      </div>
    );
  }

  const callerRole = settings.role as "owner" | "admin" | "member";
  const [tier, deletionPreview] = await Promise.all([
    getEffectiveWorkspaceTier(settings.id),
    getWorkspaceDeletionPreview(session.user.id, settings.id),
  ]);

  return (
    <WorkspaceClient
      initial={{
        id: settings.id,
        name: settings.name,
        slug: settings.slug,
        allowPublicDocuments: settings.allowPublicDocuments,
        defaultSort: settings.defaultSort,
        bio: settings.bio ?? null,
        brandColor: settings.brandColor,
        logoUrl: settings.logoUrl,
        showLogoInExports: settings.showLogoInExports,
        exportFontMain: settings.exportFontMain,
        exportFooterEnabled: settings.exportFooterEnabled,
        exportFooterCompanyName: settings.exportFooterCompanyName,
        exportFooterTagline: settings.exportFooterTagline,
        exportFooterLinkUrl: settings.exportFooterLinkUrl,
        exportFooterLinkLabel: settings.exportFooterLinkLabel,
        role: callerRole,
        tier: tier ?? "free",
        deletionPreview,
      }}
    />
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <WorkspaceContent />
    </Suspense>
  );
}
