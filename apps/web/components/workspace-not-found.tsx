import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { PublicSiteFooter } from "@/components/public-site-footer";
import { PublicSiteHeader } from "@/components/public-site-header";
import { SiteProvider } from "@/components/site-provider";
import type { CustomSiteContext } from "@/lib/site-paths";

/**
 * The 404 page on a workspace's custom domain: the workspace's header and
 * footer instead of OpenDocs' marketing page.
 */
export function WorkspaceNotFound({
  site,
  isViewerSignedIn,
}: {
  site: CustomSiteContext;
  isViewerSignedIn: boolean;
}) {
  return (
    <SiteProvider site={site}>
      <div className="flex min-h-screen flex-col bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <PublicSiteHeader isViewerSignedIn={isViewerSignedIn} />
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 sm:px-8">
          <div className="mx-auto w-full max-w-md text-center">
            <div
              aria-hidden="true"
              className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 ring-1 ring-zinc-900/[0.06] dark:bg-zinc-900 dark:ring-white/10"
            >
              <FileQuestion className="h-5 w-5 text-zinc-500" strokeWidth={1.75} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-3xl dark:text-white">
              Page not found
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-pretty text-zinc-600 sm:text-base dark:text-zinc-400">
              There&apos;s no document at this address. It may have moved or been unpublished.
            </p>
            <div className="mt-6 flex justify-center">
              <Link
                href="/"
                className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 active:scale-[0.98] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Browse {site.workspaceName}
              </Link>
            </div>
          </div>
        </main>
        <PublicSiteFooter />
      </div>
    </SiteProvider>
  );
}
