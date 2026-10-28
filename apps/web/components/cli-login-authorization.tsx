"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { authClient } from "@/lib/auth-client";

type WorkspaceOption = {
  workspaceId: string;
  name: string;
  slug: string;
};

type CliLoginAuthorizationProps = {
  requestId: string;
  state: string;
  accountName: string;
  accountEmail: string;
  clientName: string;
  callbackPath: string;
  workspaces: WorkspaceOption[];
  initialWorkspaceId: string;
};

export function CliLoginAuthorization({
  requestId,
  state,
  accountName,
  accountEmail,
  clientName,
  callbackPath,
  workspaces,
  initialWorkspaceId,
}: CliLoginAuthorizationProps) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [isApproving, setIsApproving] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWorkspace = workspaces.find((workspace) => workspace.workspaceId === workspaceId);

  async function approve() {
    setError(null);
    setIsApproving(true);
    try {
      const res = await fetch("/api/cli-auth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, state, workspaceId }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        redirectUri?: string;
        message?: string;
      };
      if (!res.ok || !payload.redirectUri) {
        throw new Error(payload.message || "Could not authorize the CLI.");
      }
      window.location.href = payload.redirectUri;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not authorize the CLI.");
      setIsApproving(false);
    }
  }

  function switchAccount() {
    setIsSwitching(true);
    startTransition(async () => {
      await authClient.signOut();
      router.push(`/login?redirect=${encodeURIComponent(callbackPath)}`);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <div className="rounded-[8px] border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-medium text-[#6941c6]">OpenDocs CLI</p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-950">Authorize browser login</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            {clientName} wants to create a new API key for your OpenDocs account.
          </p>
        </div>

        <div className="space-y-4 rounded-[8px] border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <div>
            <p className="font-medium text-neutral-950">Signed in as</p>
            <p className="mt-1 text-neutral-700">
              {accountName} <span className="text-neutral-400">·</span> {accountEmail}
            </p>
          </div>
          <div>
            <label htmlFor="cli-workspace" className="font-medium text-neutral-950">
              Workspace
            </label>
            {workspaces.length > 1 ? (
              <select
                id="cli-workspace"
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                className="mt-2 w-full rounded-[8px] border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.workspaceId} value={workspace.workspaceId}>
                    {workspace.name} ({workspace.slug})
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-1 text-neutral-700">
                {selectedWorkspace?.name ?? "Workspace"}{" "}
                {selectedWorkspace ? (
                  <span className="text-neutral-400">({selectedWorkspace.slug})</span>
                ) : null}
              </p>
            )}
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={approve}
            disabled={isApproving || isSwitching}
            className="inline-flex flex-1 items-center justify-center rounded-[8px] bg-[#6941c6] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#53389E] disabled:opacity-60"
          >
            {isApproving ? "Authorizing..." : "Authorize CLI"}
          </button>
          <button
            type="button"
            onClick={switchAccount}
            disabled={isApproving || isSwitching}
            className="inline-flex items-center justify-center rounded-[8px] border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-60"
          >
            {isSwitching ? "Signing out..." : "Use another account"}
          </button>
        </div>
      </div>
    </div>
  );
}
