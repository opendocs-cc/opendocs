"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { useSite } from "@/components/site-provider";
import { API_BASE_URL } from "@/lib/config/api";
import { isCustomSite } from "@/lib/site-paths";

/**
 * "Download all as ZIP" affordance for workspace profiles. Renders a
 * small button inside the "About this workspace" sidebar card on
 * `/[workspace]`.
 *
 * Why a fetch-and-blob dance instead of a plain `<a download>`:
 *   - Building the ZIP server-side takes a couple of seconds for a
 *     workspace with dozens of posts. With a plain anchor the user
 *     clicks, nothing visible happens, and they assume it's broken.
 *     Fetch lets us show a spinner.
 *   - Errors (404 for an inaccessible workspace, 429 for rate-limit
 *     hits) get a real inline message instead of a useless tab
 *     opening with a JSON error body.
 *
 * The API is viewer-aware: anonymous readers can download public docs
 * from public workspaces, while signed-in workspace members can
 * download the docs they can already open.
 */
type WorkspaceDownloadAllProps = {
  workspaceSlug: string;
};

export function WorkspaceDownloadAll({
  workspaceSlug,
}: WorkspaceDownloadAllProps) {
  const site = useSite();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      // On a custom domain, same-origin through /_opendocs/download, which
      // passes the reader's sign-in on the domain along to the API.
      const base = isCustomSite(site) ? "/_opendocs/download" : `${API_BASE_URL}/api/v1/public`;
      const url = `${base}/workspaces/${encodeURIComponent(workspaceSlug)}/markdown.zip`;
      const response = await fetch(url, {
        method: "GET",
        credentials: isCustomSite(site) ? "same-origin" : "include",
      });
      if (!response.ok) {
        let message = `Download failed (${response.status})`;
        try {
          const body = (await response.json()) as {
            error?: string;
            message?: string;
          };
          if (body?.message) message = body.message;
          else if (
            body?.error === "no_accessible_posts" ||
            body?.error === "no_public_posts"
          ) {
            message = "No documents are available to download yet.";
          } else if (body?.error) {
            message = body.error;
          }
        } catch {
          // Server returned a non-JSON error (rare); fall through
          // with the generic status message.
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${workspaceSlug}-markdown.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 border-t border-zinc-200/70 pt-4 dark:border-zinc-800">
      <button
        type="button"
        onClick={handleDownload}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:text-violet-300"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span>{pending ? "Building ZIP…" : "Download all as ZIP"}</span>
      </button>
      {error ? (
        <p
          role="alert"
          className="mt-2 text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          A ZIP of every <code>.md</code> you can access in this workspace.
        </p>
      )}
    </div>
  );
}
