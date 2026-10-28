import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OAuthConsent } from "@/components/oauth-consent";
import { verifiedOAuthQuery } from "@/lib/auth/oauth-verify";
import { getServerSession } from "@/lib/auth/session";
import { getOnboardingState, getUserWorkspaces } from "@/lib/workspaces/cached";
import { ensureAgentAccount } from "@opendocs/shared/agent-auth/service";
import { instanceHost } from "@opendocs/shared/config/instance";
import {
  MCP_SCOPES,
  MCP_SCOPE_DETAILS,
  parseScopes,
  type McpScope,
} from "@opendocs/shared/mcp/config";
import {
  describeOAuthClient,
  getConnection,
  getOAuthClientRecord,
  workspacesWithIntegrations,
} from "@opendocs/shared/mcp/connections";

export const metadata: Metadata = {
  title: "Connect an app",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function errorView(title: string, message: string) {
  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
        <div className="rounded-[8px] border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-[#6941c6]">OpenDocs</p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-950">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">{message}</p>
        </div>
      </div>
    </main>
  );
}

type ConsentPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * OAuth consent for MCP clients (Claude, ChatGPT, Cursor, …). Better Auth
 * sends the user here with the signed authorization request after sign-in;
 * approving posts to /api/oauth/consent, which records the connection's
 * default workspace and completes the authorization.
 */
export default async function OAuthConsentPage({ searchParams }: ConsentPageProps) {
  const params = await searchParams;
  const oauthQuery = await verifiedOAuthQuery(params);
  if (!oauthQuery) {
    return errorView(
      "This link has expired",
      "Go back to the app you were connecting and start again.",
    );
  }

  const session = await getServerSession();
  if (!session) {
    redirect(`/login?${oauthQuery}`);
  }

  const query = new URLSearchParams(oauthQuery);
  const clientId = query.get("client_id") ?? "";
  const client = await getOAuthClientRecord(clientId);
  if (!client || client.disabled) {
    return errorView(
      "We don't recognise this app",
      "Go back to the app and try connecting again. If it keeps happening, remove OpenDocs from the app and add it again.",
    );
  }

  // Someone connecting from Claude or ChatGPT may have just created their
  // account with an email code; give them a username and workspace right
  // away instead of sending them through the onboarding wizard.
  let onboarding = await getOnboardingState(session.user.id);
  if (!onboarding.completed) {
    await ensureAgentAccount(session.user.id);
    onboarding = await getOnboardingState(session.user.id);
  }

  const [workspaces, existing, cookieStore] = await Promise.all([
    getUserWorkspaces(session.user.id),
    getConnection(session.user.id, clientId),
    cookies(),
  ]);
  if (workspaces.length === 0) {
    return errorView(
      "No workspace yet",
      `Create or join a workspace on ${instanceHost()}, then connect the app again.`,
    );
  }

  const activeWorkspaceId = cookieStore.get("active_workspace_id")?.value;
  const defaultWorkspace =
    workspaces.find((w) => w.workspaceId === existing?.workspaceId) ??
    workspaces.find((w) => w.workspaceId === activeWorkspaceId) ??
    workspaces.find((w) => w.workspaceId === onboarding.workspace?.id) ??
    workspaces[0]!;

  // Only what the app asked for can be granted. Without a scope parameter
  // the app gets its registered defaults, so offer every permission.
  const requested = parseScopes(query.get("scope"));
  const offeredScopes: McpScope[] =
    requested.size === 0 ? [...MCP_SCOPES] : MCP_SCOPES.filter((scope) => requested.has(scope));
  const withIntegrations = await workspacesWithIntegrations(workspaces.map((w) => w.workspaceId));
  const app = describeOAuthClient(client, query.get("redirect_uri"));

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <OAuthConsent
        oauthQuery={oauthQuery}
        app={app}
        accountName={session.user.name || onboarding.username || session.user.email}
        accountEmail={session.user.email}
        workspaces={workspaces.map((w) => ({
          workspaceId: w.workspaceId,
          name: w.name,
          slug: w.slug,
          isAdmin: w.role === "owner" || w.role === "admin",
          hasIntegrations: withIntegrations.has(w.workspaceId),
        }))}
        initialWorkspaceId={defaultWorkspace.workspaceId}
        scopes={offeredScopes.map((scope) => ({
          scope,
          label: MCP_SCOPE_DETAILS[scope].label,
          description: MCP_SCOPE_DETAILS[scope].description,
          required: Boolean(MCP_SCOPE_DETAILS[scope].required),
        }))}
      />
    </main>
  );
}
