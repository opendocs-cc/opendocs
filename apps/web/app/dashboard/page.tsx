import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { requireServerSession } from "@/lib/auth/session";
import {
  getDashboardData,
  getTeamInviteOnboardingDismissedAt,
  getTeamStats,
  getUserWorkspaces,
  getWorkspaceSettings,
} from "@/lib/workspaces/cached";
import { agentSetupPrompt } from "@/lib/agent-prompt";
import { OFFICIAL_DOCS_URL, instanceHost, isSelfHosted } from "@opendocs/shared/config/instance";
import { FREE_PLAN_EXPORT_DEFAULTS } from "@opendocs/shared/workspaces/validation";
import { listApiKeys } from "@opendocs/shared/api-keys/service";
import { getServingCustomDomain } from "@opendocs/shared/custom-domains/service";
import { ConnectAgentCard } from "./connect-agent-card";
import { GettingStartedChecklist } from "./getting-started-checklist";

export const metadata: Metadata = { title: "Home" };

function DashboardSkeleton() {
  return (
    <div className="w-full min-h-full">
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 w-full flex flex-col gap-[32px]">
        <div className="flex flex-col gap-0.5">
          <div className="h-[30px] bg-gray-100 rounded w-64 animate-pulse" />
          <div className="h-[24px] bg-gray-100 rounded w-96 animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl p-5 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] border border-[#e5e5e5]"
            >
              <div className="animate-pulse">
                <div className="h-[24px] bg-gray-100 rounded w-32 mb-5" />
                <div className="h-[38px] bg-gray-100 rounded w-12 mb-3" />
                <div className="h-[20px] bg-gray-100 rounded w-28" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ href, label, value, detail }: { href: string; label: string; value: number; detail: string }) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-col gap-1 rounded-xl border border-[#e5e5e5] bg-white p-3 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] transition-colors hover:border-[#d0c6f3] sm:p-5"
    >
      <span className="truncate text-[13px] font-medium text-[#737373] sm:text-[14px]">{label}</span>
      <span className="text-[24px] font-semibold leading-[32px] tracking-[-0.01em] text-[#171717] sm:text-[30px] sm:leading-[38px]">
        {value}
      </span>
      <span className="truncate text-[12px] text-[#737373] group-hover:text-[#6941c6] sm:text-[13px]">{detail}</span>
    </Link>
  );
}

async function DashboardContent() {
  const session = await requireServerSession();

  // Resolve active workspace from cookie
  const cookieStore = await cookies();
  const activeWsCookie = cookieStore.get("active_workspace_id")?.value;
  const allWorkspaces = await getUserWorkspaces(session.user.id);
  const activeWorkspaceId =
    activeWsCookie &&
    allWorkspaces.some((w) => w.workspaceId === activeWsCookie)
      ? activeWsCookie
      : allWorkspaces[0]?.workspaceId;

  const [data, teamStats, apiKeys, teamInviteDismissedAt, workspaceSettings] = await Promise.all([
    getDashboardData(session.user.id, activeWorkspaceId),
    getTeamStats(session.user.id, activeWorkspaceId),
    listApiKeys(session.user.id),
    getTeamInviteOnboardingDismissedAt(session.user.id),
    getWorkspaceSettings(session.user.id, activeWorkspaceId),
  ]);

  const activeApiKeys = apiKeys.filter((k) => k.lastUsedAt !== null).length;

  // Unpublished documents are offline and don't count toward the plan.
  const livePosts = data.posts.filter((p) => p.isPublished);
  const totalDocs = livePosts.length;
  const publicDocs = livePosts.filter((p) => p.visibility === "public").length;
  const privateDocs = livePosts.filter((p) => p.visibility === "private").length;
  const sharedDocs = totalDocs - publicDocs - privateDocs;
  const docsDetail =
    [
      publicDocs && `${publicDocs} public`,
      sharedDocs && `${sharedDocs} in workspace`,
      privateDocs && `${privateDocs} private`,
    ]
      .filter(Boolean)
      .join(" · ") || "None yet";
  const publishedFirstDocument = totalDocs > 0;
  const teamStepCompleted =
    (teamStats?.totalMembers ?? 1) > 1 || (teamStats?.pendingInvites ?? 0) > 0;
  const inviteStepDismissed = Boolean(teamInviteDismissedAt);
  // Only owners and admins can change export branding; for members the
  // step doesn't apply. Anything other than the defaults counts as done.
  const canCustomizeExports = workspaceSettings?.role === "owner" || workspaceSettings?.role === "admin";
  const exportsCustomized =
    !canCustomizeExports ||
    (workspaceSettings != null &&
      (workspaceSettings.brandColor !== FREE_PLAN_EXPORT_DEFAULTS.brandColor ||
        (workspaceSettings.exportFontMain ?? FREE_PLAN_EXPORT_DEFAULTS.exportFontMain) !==
          FREE_PLAN_EXPORT_DEFAULTS.exportFontMain ||
        workspaceSettings.showLogoInExports));
  const showGettingStarted =
    !publishedFirstDocument || !exportsCustomized || (!teamStepCompleted && !inviteStepDismissed);
  const displayName =
    data.onboarding.username ?? session.user.email.split("@")[0];

  // The workspace-visit CTA card uses the currently active workspace — the
  // one the rest of the dashboard is already scoped to. Resolved above from
  // the `active_workspace_id` cookie, falling back to the first membership.
  const activeWorkspace = allWorkspaces.find(
    (w) => w.workspaceId === activeWorkspaceId,
  );
  // A workspace with a custom domain is visited there (its private pages
  // too: members sign in on the domain without noticing).
  const customDomain = activeWorkspace ? await getServingCustomDomain(activeWorkspace.workspaceId) : null;
  const workspaceInitials = activeWorkspace
    ? activeWorkspace.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "";

  return (
    <div className="w-full min-h-full">
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 w-full flex flex-col gap-[32px]">
        <PageHeader
          title={`Welcome back, ${displayName}`}
          description={activeWorkspace ? `Here's what's happening in ${activeWorkspace.name}.` : undefined}
        />

        {/* Workspace CTA — prominent entry point to the public profile */}
        {activeWorkspace ? (
          <Link
            href={customDomain?.origin ?? `/${activeWorkspace.slug}`}
            className="group flex flex-col gap-4 rounded-xl border border-[#e5e5e5] bg-white p-5 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] transition-all hover:border-[#d0c6f3] hover:shadow-[0px_4px_16px_0px_rgba(127,86,217,0.08)] sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          >
            <div className="flex min-w-0 flex-1 items-center gap-4">
              {/* <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F4EBFF] ring-1 ring-inset ring-[#E9D7FE]">
                <span className="text-[16px] font-semibold text-[#6941C6]">
                  {workspaceInitials}
                </span>
              </div> */}
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#6941C6]">
                  Your workspace
                </div>
                <div className="mt-1.5 truncate text-[18px] font-semibold leading-tight text-[#171717]">
                  {activeWorkspace.name}
                </div>
                <div className="mt-1 truncate font-mono text-[13px] text-[#737373] transition-colors group-hover:text-[#6941C6]">
                  {customDomain ? customDomain.hostname : `${instanceHost()}/${activeWorkspace.slug}`}
                </div>
              </div>
            </div>
            <div className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 self-stretch rounded-lg bg-[#7F56D9] px-4 py-2.5 text-[14px] font-semibold text-white transition-colors group-hover:bg-[#6941C6] sm:self-auto">
              View workspace
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </div>
          </Link>
        ) : null}

        {/* Connect your agent. Phones (and screen readers) get it straight
            after the workspace card; from md up it sits under the metrics. */}
        <ConnectAgentCard
          className="md:order-2"
          email={session.user.email}
          workspaceName={activeWorkspace?.name}
          workspaceSlug={activeWorkspace?.slug}
          hasConnectedAgent={activeApiKeys > 0}
        />

        {/* Metric Group */}
        <div className="grid grid-cols-3 gap-3 sm:gap-6 md:order-1">
          <Metric href="/dashboard/documents" label="Documents" value={totalDocs} detail={docsDetail} />
          <Metric
            href="/dashboard/api-keys"
            label="API keys"
            value={apiKeys.length}
            detail={apiKeys.length ? `${activeApiKeys} used` : "None yet"}
          />
          <Metric
            href="/dashboard/team"
            label="Members"
            value={teamStats?.totalMembers ?? 1}
            detail={teamStats?.pendingInvites ? `${teamStats.pendingInvites} invited` : "In this workspace"}
          />
        </div>

        {showGettingStarted && (
          <div className="md:order-3">
            <GettingStartedChecklist
              publishedFirstDocument={publishedFirstDocument}
              exportsCustomized={exportsCustomized}
              showExportsStep={canCustomizeExports}
              teamStepCompleted={teamStepCompleted}
              inviteStepDismissed={inviteStepDismissed}
              agentPrompt={agentSetupPrompt({
                email: session.user.email,
                workspaceName: activeWorkspace?.name,
                workspaceSlug: activeWorkspace?.slug,
              })}
            />
          </div>
        )}

        {/* Help Section */}
        <div className="flex flex-col gap-6 mt-4 md:order-4">
          <div className="flex flex-col gap-5">
            <h2 className="text-[16px] font-semibold text-[#171717] leading-[24px]">
              Need help getting started?
            </h2>
            <div className="h-px w-full bg-[#e5e5e5]" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <a
              href={isSelfHosted() ? `${OFFICIAL_DOCS_URL}/getting-started/quickstart` : "https://opendocs.cc/opendocs-hq/welcome"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-4 group cursor-pointer"
            >
              <div className="aspect-[384/256] w-full relative rounded-xl overflow-hidden border border-[rgba(0,0,0,0.1)]">
                <img
                  src="/welcome-card.png"
                  alt="OpenDocs welcome article"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-[16px] font-semibold text-[#171717] leading-[24px]">
                    Start with the official OpenDocs welcome guide
                  </h3>
                  <p className="text-[16px] font-normal text-[#525252] leading-[24px]">
                    A short walkthrough of the workspace, publishing, and exports.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 font-semibold text-[16px]">
                  <span className="text-[#6941c6]">Read welcome guide</span>
                  <ArrowUpRight
                    className="w-5 h-5 text-[#9E77ED]"
                    strokeWidth={1.67}
                  />
                </div>
              </div>
            </a>

            <a
              href="https://docs.opendocs.cc"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-4 group cursor-pointer"
            >
              <div className="aspect-[384/256] w-full relative rounded-xl overflow-hidden border border-[rgba(0,0,0,0.1)]">
                <img
                  src="/docs-card.png"
                  alt="OpenDocs documentation"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-[16px] font-semibold text-[#171717] leading-[24px]">
                    Want to dive deeper? Read our docs
                  </h3>
                  <p className="text-[16px] font-normal text-[#525252] leading-[24px]">
                    For those who want to get into the nitty gritty details.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 font-semibold text-[16px]">
                  <span className="text-[#6941c6]">Go to docs</span>
                  <ArrowUpRight
                    className="w-5 h-5 text-[#9E77ED]"
                    strokeWidth={1.67}
                  />
                </div>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardHomePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
