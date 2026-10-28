"use client";

import { BadgeCheck, ShieldAlert } from "lucide-react";
import { startTransition, useMemo, useState } from "react";

import { authClient } from "@/lib/auth-client";

type WorkspaceOption = {
  workspaceId: string;
  name: string;
  slug: string;
  isAdmin: boolean;
  hasIntegrations: boolean;
};

type ScopeOption = {
  scope: string;
  label: string;
  description: string;
  required: boolean;
};

type OAuthConsentProps = {
  oauthQuery: string;
  app: { name: string; host: string | null; verified: boolean; icon: string | null; note?: string };
  accountName: string;
  accountEmail: string;
  workspaces: WorkspaceOption[];
  initialWorkspaceId: string;
  scopes: ScopeOption[];
};

/** Which optional permissions start ticked for a workspace. */
function defaultSelection(scopes: ScopeOption[], workspace: WorkspaceOption | undefined) {
  const selected = new Set<string>();
  for (const { scope } of scopes) {
    if (scope === "workspace:admin") continue;
    if (scope === "integrations" && !workspace?.hasIntegrations) continue;
    selected.add(scope);
  }
  return selected;
}

export function OAuthConsent({
  oauthQuery,
  app,
  accountName,
  accountEmail,
  workspaces,
  initialWorkspaceId,
  scopes,
}: OAuthConsentProps) {
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const workspace = workspaces.find((w) => w.workspaceId === workspaceId);
  const [selected, setSelected] = useState(() => defaultSelection(scopes, workspace));
  const [pending, setPending] = useState<"allow" | "deny" | "switch" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Team admin is only offered to owners and admins of the chosen workspace.
  const visibleScopes = useMemo(
    () => scopes.filter((s) => s.scope !== "workspace:admin" || workspace?.isAdmin),
    [scopes, workspace],
  );

  function toggle(scope: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  async function submit(accept: boolean) {
    setError(null);
    setPending(accept ? "allow" : "deny");
    try {
      const granted = visibleScopes
        .filter((s) => s.required || selected.has(s.scope))
        .map((s) => s.scope);
      const res = await fetch("/api/oauth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oauthQuery, accept, workspaceId, scopes: granted }),
      });
      const payload = (await res.json().catch(() => ({}))) as { scope?: string | null; message?: string };
      if (!res.ok || payload.scope === undefined) {
        throw new Error(payload.message || "Something went wrong. Go back to the app and try again.");
      }
      // oauthProviderClient adds the signed request from this page's URL.
      const { data, error: consentError } = await authClient.$fetch<{ url?: string }>("/oauth2/consent", {
        method: "POST",
        body: payload.scope ? { accept, scope: payload.scope } : { accept },
      });
      if (consentError || !data?.url) {
        throw new Error(
          consentError?.message || "Could not finish connecting. Go back to the app and connect again.",
        );
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(null);
    }
  }

  function switchAccount() {
    setPending("switch");
    startTransition(async () => {
      await authClient.signOut();
      window.location.href = `/login?${oauthQuery}`;
    });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <div className="rounded-[8px] border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-medium text-[#6941c6]">OpenDocs</p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-950">
            {app.name} wants to use your OpenDocs account
          </h1>
          {app.verified ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-neutral-600">
              <BadgeCheck className="h-4 w-4 text-[#6941c6]" aria-hidden="true" />
              Verified app{app.host ? ` from ${app.host}` : ""}
            </p>
          ) : (
            <p className="mt-2 inline-flex items-start gap-1.5 text-sm text-neutral-600">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span>
                Unverified app{app.host ? ` (sends you back to ${app.host})` : ""}. Only continue if you
                just added OpenDocs to this app yourself.
              </span>
            </p>
          )}
        </div>

        <div className="space-y-4 rounded-[8px] border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <div>
            <p className="font-medium text-neutral-950">Signed in as</p>
            <p className="mt-1 text-neutral-700">
              {accountName} <span className="text-neutral-400">·</span> {accountEmail}
            </p>
          </div>
          <div>
            <label htmlFor="oauth-workspace" className="font-medium text-neutral-950">
              Workspace
            </label>
            {workspaces.length > 1 ? (
              <>
                <select
                  id="oauth-workspace"
                  value={workspaceId}
                  onChange={(event) => {
                    const next = workspaces.find((w) => w.workspaceId === event.target.value);
                    setWorkspaceId(event.target.value);
                    setSelected(defaultSelection(scopes, next));
                  }}
                  className="mt-2 w-full rounded-[8px] border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
                >
                  {workspaces.map((w) => (
                    <option key={w.workspaceId} value={w.workspaceId}>
                      {w.name} ({w.slug})
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs leading-5 text-neutral-500">
                  New documents go here by default. You can ask {app.name} to use another workspace at any
                  time.
                </p>
              </>
            ) : (
              <p className="mt-1 text-neutral-700">
                {workspace?.name ?? "Workspace"}{" "}
                {workspace ? <span className="text-neutral-400">({workspace.slug})</span> : null}
              </p>
            )}
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-neutral-950">{app.name} will be able to</legend>
          <ul className="mt-3 space-y-3">
            {visibleScopes.map((s) => {
              const checked = s.required || selected.has(s.scope);
              return (
                <li key={s.scope}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-[#6941c6]"
                      checked={checked}
                      disabled={s.required || pending !== null}
                      onChange={() => toggle(s.scope)}
                    />
                    <span>
                      <span className="block text-sm font-medium text-neutral-900">{s.label}</span>
                      <span className="block text-sm leading-5 text-neutral-600">{s.description}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs leading-5 text-neutral-500">
            {app.note ??
              `${app.name} asks you before it makes a document public, deletes anything, invites people or sends a document for signature.`}{" "}
            You can disconnect it at any time in Dashboard → Connected apps.
          </p>
        </fieldset>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={pending !== null}
            className="inline-flex flex-1 items-center justify-center rounded-[8px] bg-[#6941c6] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#53389E] disabled:opacity-60"
          >
            {pending === "allow" ? "Connecting..." : "Allow"}
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={pending !== null}
            className="inline-flex items-center justify-center rounded-[8px] border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-60"
          >
            {pending === "deny" ? "Cancelling..." : "Cancel"}
          </button>
        </div>
        <button
          type="button"
          onClick={switchAccount}
          disabled={pending !== null}
          className="mt-4 text-sm font-semibold text-[#6941c6] hover:text-[#53389E] disabled:opacity-60"
        >
          {pending === "switch" ? "Signing out..." : "Use another account"}
        </button>
      </div>
    </div>
  );
}
