import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardNav } from "@/components/dashboard-nav";
import { requireServerSession } from "@/lib/auth/session";
import { getFounderOfferView } from "@/lib/billing/founder-offer";
import {
  getOnboardingState,
  getProfileSettings,
  getWorkspaceSettings,
  getUserWorkspaces,
  getUserEffectiveBillingTier,
  getUserCompedTier,
  getOwnedWorkspaceCount,
  getUserWorkspaceLimit,
} from "@/lib/workspaces/cached";

type DashboardLayoutProps = {
  children: ReactNode;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const session = await requireServerSession();

  const cookieStore = await cookies();
  const activeWorkspaceCookie = cookieStore.get("active_workspace_id")?.value;

  const [onboarding, profileSettings, allWorkspaces, effectivePlan, compedTier, ownedCount, workspaceLimit, founderOffer] = await Promise.all([
    getOnboardingState(session.user.id),
    getProfileSettings(session.user.id),
    getUserWorkspaces(session.user.id),
    getUserEffectiveBillingTier(session.user.id),
    getUserCompedTier(session.user.id),
    getOwnedWorkspaceCount(session.user.id),
    getUserWorkspaceLimit(session.user.id),
    getFounderOfferView(),
  ]);

  if (!onboarding.completed || !onboarding.workspace) {
    redirect("/onboarding");
  }

  // Determine the active workspace: use cookie if valid, otherwise first workspace
  const activeWorkspaceId =
    activeWorkspaceCookie && allWorkspaces.some((w) => w.workspaceId === activeWorkspaceCookie)
      ? activeWorkspaceCookie
      : allWorkspaces[0]?.workspaceId;

  const workspaceSettings = await getWorkspaceSettings(
    session.user.id,
    activeWorkspaceId,
  );

  const username = onboarding.username ?? session.user.email;

  return (
    <div className="dashboard-light flex flex-col md:flex-row min-h-screen md:h-screen bg-[#fafafa] text-gray-900 font-sans md:overflow-hidden">
      <DashboardNav
        user={{
          username,
          fullName: profileSettings?.fullName ?? null,
          email: session.user.email,
          avatarUrl: profileSettings?.profilePictureUrl ?? null,
          compedTier,
          role: workspaceSettings?.role ?? "member",
        }}
        workspaces={allWorkspaces.map((w) => ({
          id: w.workspaceId,
          name: w.name,
          slug: w.slug,
          logoUrl: w.logoUrl,
          role: w.role as "owner" | "admin" | "member",
        }))}
        activeWorkspaceId={activeWorkspaceId}
        effectivePlan={effectivePlan}
        ownedWorkspaceCount={ownedCount}
        workspaceLimit={workspaceLimit.limit}
        founderOffer={founderOffer}
      />
      {/* `relative` keeps absolutely positioned children (sr-only labels,
          hidden inputs) inside this scroll container. Without it they're
          placed against <body> at their spot far down the page, which
          makes the whole window scroll past the dashboard. */}
      <main className="relative flex-1 md:h-full md:overflow-y-auto bg-[#fafafa] md:border-l border-gray-200">{children}</main>
    </div>
  );
}
