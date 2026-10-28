import type { Metadata } from "next";
import { Suspense } from "react";

import { requireServerSession } from "@/lib/auth/session";
import { API_BASE_URL } from "@/lib/config/api";
import { getDocuSealSetup } from "@opendocs/shared/integrations/connections";
import { getGoogleDriveOAuthConfig } from "@opendocs/shared/integrations/google-drive";
import { getIntegrationsOverview, isServiceError } from "@opendocs/shared/integrations/service";
import { listSignatureRequests } from "@opendocs/shared/integrations/signatures";

import { IntegrationsClient, UpgradePrompt } from "./integrations-client";
import { getActiveWorkspaceId } from "./workspace";

export const metadata: Metadata = { title: "Integrations" };

function IntegrationsSkeleton() {
  return (
    <div className="w-full min-h-full">
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">
        <div>
          <div className="h-[28px] bg-gray-100 rounded w-36 animate-pulse" />
          <div className="h-[20px] bg-gray-100 rounded w-80 animate-pulse mt-2" />
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8">
            <div className="h-[60px] bg-gray-100 rounded animate-pulse" />
            <div className="h-[140px] bg-gray-100 rounded-xl animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

type SearchParams = Promise<{ connected?: string; error?: string }>;

async function IntegrationsContent({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireServerSession();
  const workspaceId = await getActiveWorkspaceId(session.user.id);
  const flash = await searchParams;

  const overview = workspaceId ? await getIntegrationsOverview(session.user.id, workspaceId) : null;
  if (!workspaceId || !overview || (isServiceError(overview) && overview.error !== "plan_required")) {
    return (
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10">
        <h1 className="text-[20px] font-semibold text-[#171717]">Integrations</h1>
        <p className="text-[15px] text-[#525252] mt-1">No workspace found.</p>
      </div>
    );
  }
  if (isServiceError(overview)) return <UpgradePrompt />;

  const drive = overview.integrations.find((i) => i.provider === "google_drive")!;
  const docuseal = overview.integrations.find((i) => i.provider === "docuseal")!;
  const oauth = getGoogleDriveOAuthConfig();
  const [setup, requests] = await Promise.all([
    overview.canManage && docuseal.status !== "not_connected"
      ? getDocuSealSetup(workspaceId, API_BASE_URL)
      : Promise.resolve(null),
    overview.canUse ? listSignatureRequests(session.user.id, workspaceId) : Promise.resolve(null),
  ]);

  return (
    <IntegrationsClient
      workspaceId={workspaceId}
      workspaceName={overview.workspace.name}
      canManage={overview.canManage}
      canUse={overview.canUse}
      settings={overview.settings}
      drive={{
        status: drive.status,
        account: drive.account,
        error: drive.error ?? null,
        destinations: drive.destinations ?? [],
        configured: Boolean(oauth),
        pickerConfigured: Boolean(oauth?.pickerApiKey && oauth.appId),
      }}
      docuseal={{
        status: docuseal.status,
        account: docuseal.account,
        error: docuseal.error ?? null,
        region: docuseal.region ?? null,
        webhookUrl: setup?.webhookUrl ?? null,
        hasWebhookSecret: setup?.hasWebhookSecret ?? false,
      }}
      requests={
        requests && !isServiceError(requests)
          ? requests.requests.map((r) => ({
              id: r.id,
              title: r.document.title,
              versionNumber: r.document.versionNumber,
              status: r.status,
              signers: r.signers.map((s) => ({ name: s.name, email: s.email, status: s.status })),
              createdAt: r.createdAt,
            }))
          : []
      }
      flash={{ connected: flash.connected ?? null, error: flash.error ?? null }}
    />
  );
}

export default function IntegrationsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<IntegrationsSkeleton />}>
      <IntegrationsContent searchParams={searchParams} />
    </Suspense>
  );
}
