import Link from "next/link";

import { getSiteContext } from "@/lib/site-context";
import { isCustomSite, publishedWithOpenDocsUrl } from "@/lib/site-paths";

/** Footer for the public workspace, article and private-workspace pages. */
export async function PublicSiteFooter() {
  const site = await getSiteContext();

  // On a custom domain the pages are the workspace's: no OpenDocs pricing
  // or legal links, just the one line that says where it's published, which
  // the workspace can hide (Workspace settings → Custom domain).
  if (isCustomSite(site)) {
    return (
      <footer className="mt-20 border-t border-zinc-100 dark:border-white/[0.06]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 dark:text-zinc-400">
          <p className="font-medium text-zinc-700 dark:text-zinc-300">{site.workspaceName}</p>
          {site.showPoweredBy ? (
            <p>
              Published with{" "}
              <a
                href={publishedWithOpenDocsUrl(site.workspaceSlug)}
                className="font-medium text-zinc-800 transition-colors hover:text-primary dark:text-zinc-200 dark:hover:text-violet-300"
              >
                OpenDocs
              </a>
            </p>
          ) : null}
        </div>
      </footer>
    );
  }

  return (
    <footer className="mt-20 border-t border-zinc-100 dark:border-white/[0.06]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 dark:text-zinc-400">
        <p>
          Published with{" "}
          <Link
            href="/"
            className="font-medium text-zinc-800 transition-colors hover:text-primary dark:text-zinc-200 dark:hover:text-violet-300"
          >
            OpenDocs
          </Link>
          , Markdown publishing for people and agents.
        </p>
        <nav aria-label="Footer" className="flex gap-5">
          <Link href="/pricing" className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">
            Pricing
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
