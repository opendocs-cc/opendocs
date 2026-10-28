import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CliLoginAuthorization } from "@/components/cli-login-authorization";
import { getServerSession } from "@/lib/auth/session";
import { getOnboardingState, getUserWorkspaces } from "@/lib/workspaces/cached";
import { getCliLoginRequestForApproval } from "@opendocs/shared/cli-auth/service";

type CliLoginPageProps = {
  searchParams: Promise<{
    request?: string;
    state?: string;
  }>;
};

function errorView(title: string, message: string) {
  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
        <div className="rounded-[8px] border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-[#6941c6]">OpenDocs CLI</p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-950">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">{message}</p>
        </div>
      </div>
    </main>
  );
}

export default async function CliLoginPage({ searchParams }: CliLoginPageProps) {
  const params = await searchParams;
  const requestId = params.request;
  const state = params.state;

  if (!requestId || !state) {
    return errorView("Invalid login link", "Run opendocs login --browser again.");
  }

  const callbackPath = `/cli/login?request=${encodeURIComponent(requestId)}&state=${encodeURIComponent(state)}`;
  const session = await getServerSession();
  if (!session) {
    redirect(`/login?redirect=${encodeURIComponent(callbackPath)}`);
  }

  const [request, onboarding, workspaces, cookieStore] = await Promise.all([
    getCliLoginRequestForApproval(requestId, state),
    getOnboardingState(session.user.id),
    getUserWorkspaces(session.user.id),
    cookies(),
  ]);

  if (!request) {
    return errorView(
      "Login request expired",
      "This CLI login request is no longer valid. Return to your terminal and run opendocs login --browser again.",
    );
  }

  if (!onboarding.completed) {
    redirect("/onboarding");
  }

  if (workspaces.length === 0) {
    return errorView(
      "No workspace available",
      "Create or join a workspace before authorizing the CLI.",
    );
  }

  const activeWorkspaceId = cookieStore.get("active_workspace_id")?.value;
  const activeWorkspace =
    workspaces.find((workspace) => workspace.workspaceId === activeWorkspaceId) ??
    workspaces.find((workspace) => workspace.workspaceId === onboarding.workspace?.id) ??
    workspaces[0];

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <CliLoginAuthorization
        requestId={requestId}
        state={state}
        accountName={session.user.name || onboarding.username || session.user.email}
        accountEmail={session.user.email}
        clientName={request.clientName || "OpenDocs CLI"}
        callbackPath={callbackPath}
        workspaces={workspaces.map((workspace) => ({
          workspaceId: workspace.workspaceId,
          name: workspace.name,
          slug: workspace.slug,
        }))}
        initialWorkspaceId={activeWorkspace.workspaceId}
      />
    </main>
  );
}
