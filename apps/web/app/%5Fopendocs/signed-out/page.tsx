import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogOut } from "lucide-react";

import { PublicSiteFooter } from "@/components/public-site-footer";
import { PublicSiteHeader } from "@/components/public-site-header";
import { SiteProvider } from "@/components/site-provider";
import { getSiteContext } from "@/lib/site-context";
import { customSignInHref, isCustomSite } from "@/lib/site-paths";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteContext();
  return {
    title: { absolute: isCustomSite(site) ? `Signed out · ${site.workspaceName}` : "Signed out" },
    robots: { index: false, follow: false },
  };
}

/**
 * /_opendocs/signed-out on a custom domain, where "Sign out" lands
 * (app/%5Fopendocs/sign-out). It keeps the workspace's own header and
 * footer, like its other pages, and offers the way back in.
 */
export default async function SignedOutPage() {
  const site = await getSiteContext();
  if (!isCustomSite(site)) notFound();

  return (
    <SiteProvider site={site}>
      <div className="flex min-h-screen flex-col bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <PublicSiteHeader isViewerSignedIn={false} />
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 sm:px-8">
          <div className="mx-auto w-full max-w-md text-center">
            <div
              aria-hidden="true"
              className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 ring-1 ring-zinc-900/[0.06] dark:bg-zinc-900 dark:ring-white/10"
            >
              <LogOut className="h-5 w-5 text-zinc-500" strokeWidth={1.75} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-3xl dark:text-white">
              You&apos;re signed out
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-pretty text-zinc-600 sm:text-base dark:text-zinc-400">
              You&apos;ve signed out of {site.hostname}, and of OpenDocs on this browser.
            </p>
            <div className="mx-auto mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              {/* A full page load: sign-in runs through route handlers. */}
              <a
                href={customSignInHref("/")}
                className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 active:scale-[0.98] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Sign in again
              </a>
              <Link
                href="/"
                className="inline-flex h-10 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-900/10 transition hover:text-zinc-950 hover:ring-zinc-900/20 active:scale-[0.98] dark:bg-zinc-900 dark:text-zinc-200 dark:ring-white/10 dark:hover:text-white"
              >
                Back to {site.workspaceName}
              </Link>
            </div>
          </div>
        </main>
        <PublicSiteFooter />
      </div>
    </SiteProvider>
  );
}
