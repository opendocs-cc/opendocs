"use client";

import { useState } from "react";
import {
  ChevronDown,
  Code,
  Download,
  FileDown,
  FileText,
  Loader2,
} from "lucide-react";

import { useSite } from "@/components/site-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isCustomSite } from "@/lib/site-paths";

type ArticleDownloadButtonsProps = {
  workspaceSlug: string;
  projectSlug?: string | null;
  postSlug: string;
  /**
   * True when the workspace owner is on a paid tier — we render the
   * DOCX button. Free-tier owners only expose PDF. Gated here and on
   * the server (`/public/posts/:ws/:slug/export/docx` returns 403
   * `docx_requires_pro` for free owners), so a client-side flag flip
   * still fails cleanly.
   */
  canExportDocx: boolean;
  /**
   * Absolute URL of the API backend, e.g.
   * `https://api.opendocs.cc`. Read from `NEXT_PUBLIC_API_URL` in
   * `lib/config/api.ts` and threaded through the RSC tree so this
   * client component doesn't have to touch `process.env`.
   */
  apiBaseUrl: string;
};

// `md` is GET against `/raw`, `pdf` and `docx` are POST against
// `/export/:format`. The handler branches on the format string, but
// from the user's perspective they're all the same "download this
// post in format X" affordance — same loading spinner, same error
// surface.
type Format = "pdf" | "docx" | "md";

const FORMAT_META: Record<
  Format,
  {
    label: string;
    description: string;
    extension: string;
    Icon: typeof Download;
  }
> = {
  pdf: {
    label: "PDF",
    description: "Best for sharing or printing.",
    extension: ".pdf",
    Icon: Download,
  },
  docx: {
    label: "DOCX",
    description: "Edit in Word or Google Docs.",
    extension: ".docx",
    Icon: FileText,
  },
  md: {
    label: "Markdown",
    description: "Download the original source.",
    extension: ".md",
    Icon: Code,
  },
};

/**
 * "Download PDF / DOCX" buttons rendered near the top of the article
 * page. Fetches the file from the public export endpoint as a blob,
 * then triggers a download via a transient `<a download>` — the
 * standard browser pattern when you need a custom filename and can't
 * just point at a GET URL (our endpoint is POST-only to match the
 * authenticated export route's shape).
 *
 * Each button has its own pending state so clicking one doesn't grey
 * out the other. Errors surface as a small inline message under the
 * buttons that clears on the next successful click.
 */
export function ArticleDownloadButtons({
  workspaceSlug,
  projectSlug,
  postSlug,
  canExportDocx,
  apiBaseUrl,
}: ArticleDownloadButtonsProps) {
  const site = useSite();
  const [pending, setPending] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(format: Format) {
    if (pending) return;
    setPending(format);
    setError(null);
    try {
      // `md` lives at `/raw` (GET, no body); the converter formats
      // live at `/export/:format` (POST). Build the right URL +
      // request shape depending on which one we're asking for.
      const isRaw = format === "md";
      const tail = isRaw ? "raw" : `export/${format}`;
      // On a custom domain, same-origin through /_opendocs/download, which
      // passes the reader's sign-in on the domain along to the API.
      const base = isCustomSite(site) ? "/_opendocs/download" : `${apiBaseUrl}/api/v1/public`;
      const url = projectSlug
        ? `${base}/posts/${encodeURIComponent(
            workspaceSlug,
          )}/projects/${encodeURIComponent(projectSlug)}/${encodeURIComponent(postSlug)}/${tail}`
        : `${base}/posts/${encodeURIComponent(
            workspaceSlug,
          )}/${encodeURIComponent(postSlug)}/${tail}`;
      const response = await fetch(url, {
        method: isRaw ? "GET" : "POST",
        ...(isRaw
          ? {}
          : {
              // The export endpoint accepts no body; send an empty
              // JSON object so any middleware that insists on
              // application/json doesn't choke on a missing
              // content type.
              headers: { "Content-Type": "application/json" },
              body: "{}",
            }),
        // Forward the session cookie so the API can tell who's
        // asking — authors download their own drafts, workspace
        // members download workspace posts, anonymous visitors get
        // public posts only. CORS is configured with
        // `credentials: true` on the API side. On a custom domain the
        // request is same-origin and carries the domain's sign-in.
        credentials: isCustomSite(site) ? "same-origin" : "include",
      });
      if (!response.ok) {
        // Surface the server's typed error code if it sent one. 403
        // `docx_requires_pro` is the most common reason a button
        // would fail here (raced tier downgrade or spoofed flag).
        let message = `Download failed (${response.status})`;
        try {
          const body = (await response.json()) as {
            error?: string;
            message?: string;
          };
          if (body?.error === "docx_requires_pro") {
            message = "DOCX export requires a Pro workspace.";
          } else if (body?.message) {
            message = body.message;
          } else if (body?.error) {
            message = body.error;
          }
        } catch {
          // Server didn't return JSON — keep the generic status message.
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${postSlug}.${format}`;
      // Appending to `document.body` makes the click work in Firefox —
      // standalone detached anchors are ignored there.
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Give the browser a tick to kick off the download before we
      // revoke the URL. 1000ms is conservative but cheap; the URL is
      // cleaned up automatically on page unload regardless.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(null);
    }
  }

  const formats: Format[] = canExportDocx ? ["pdf", "docx", "md"] : ["pdf", "md"];

  return (
    <div className="flex items-center">
      {/* Non-modal so opening it never locks or shifts the page. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending !== null}
            className="inline-flex h-9 items-center justify-between gap-2 rounded-full bg-zinc-900 px-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-65 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileDown className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{pending ? `Preparing ${FORMAT_META[pending].extension}` : "Download"}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className="w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-zinc-200 bg-white p-1.5 shadow-2xl shadow-zinc-900/12 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/35"
        >
          <DropdownMenuLabel className="px-3 py-2">
            <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
              Download document
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="mx-2 mb-1 bg-zinc-100 dark:bg-zinc-800" />
          {formats.map((format) => {
            const meta = FORMAT_META[format];
            const Icon = meta.Icon;
            const isPending = pending === format;

            return (
              <DropdownMenuItem
                key={format}
                disabled={pending !== null}
                onSelect={(event) => {
                  event.preventDefault();
                  void handleDownload(format);
                }}
                className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 focus:bg-violet-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60 dark:focus:bg-violet-400/10"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-50 text-zinc-500 ring-1 ring-zinc-900/5 transition group-focus:bg-white group-focus:text-primary dark:bg-zinc-900 dark:text-zinc-400 dark:ring-white/10 dark:group-focus:bg-zinc-800 dark:group-focus:text-violet-300">
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {meta.label}
                  </span>
                  <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {meta.description}
                  </span>
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
                  {meta.extension}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </div>
  );
}
