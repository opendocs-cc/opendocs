"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { CommentsTrigger } from "@/components/comments-trigger";
import { CustomDomainUserMenu } from "@/components/custom-domain-user-menu";
import { OpenDocsWordmark } from "@/components/opendocs-wordmark";
import {
  PublicUserMenu,
  type PublicUserMenuData,
} from "@/components/public-user-menu";
import { useSite } from "@/components/site-provider";
import { ThemeDropdownButton } from "@/components/theme-menu";
import { WorkspaceSearch } from "@/components/workspace-search";
import {
  customSignInHref,
  isCustomSite,
  type CustomSiteContext,
} from "@/lib/site-paths";

type PublicSiteHeaderProps = {
  /** Workspace the search dialog searches; omit to hide search. */
  workspaceSlug?: string;
  isViewerSignedIn: boolean;
  userMenu?: PublicUserMenuData | null;
  /** Renders the comments pill (article pages only). */
  comments?: { canComment: boolean } | null;
  /** Where "Sign in" returns to; defaults to the current page. */
  signInRedirect?: string;
  /** Optional content between the wordmark and the actions (e.g. a breadcrumb). */
  children?: ReactNode;
};

const pillClass =
  "h-9 items-center rounded-full bg-white px-3.5 text-sm font-medium text-zinc-700 shadow-sm shadow-zinc-900/5 ring-1 ring-zinc-900/10 transition-colors hover:text-zinc-950 hover:ring-zinc-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-white/10 dark:hover:text-white dark:hover:ring-white/20";

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** On a custom domain the workspace, not OpenDocs, owns the header. */
function WorkspaceIdentity({ site }: { site: CustomSiteContext }) {
  return (
    <Link
      href="/"
      className="group inline-flex h-10 min-w-0 flex-none items-center gap-2.5"
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-900/[0.06] dark:bg-zinc-900 dark:ring-white/10">
        {site.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={site.logoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            {initialsFor(site.workspaceName)}
          </span>
        )}
      </span>
      <span className="max-w-[40vw] truncate text-[15px] font-semibold tracking-[-0.01em] text-zinc-900 sm:max-w-[260px] dark:text-zinc-100">
        {site.workspaceName}
      </span>
    </Link>
  );
}

/**
 * Header for the public workspace and article pages. It is `sticky`, so it
 * stays reachable on long pages without the layout shift a fixed header
 * would cause; the border and backdrop only appear once the page scrolls.
 * On a custom domain it shows the workspace's logo and name instead of the
 * OpenDocs wordmark, and nothing of OpenDocs: the footer's "Published with
 * OpenDocs" line is the only mention, and the workspace can turn it off.
 */
export function PublicSiteHeader({
  workspaceSlug,
  isViewerSignedIn,
  userMenu = null,
  comments = null,
  signInRedirect,
  children,
}: PublicSiteHeaderProps) {
  const site = useSite();
  const customSite = isCustomSite(site) ? site : null;
  const [scrolled, setScrolled] = useState(false);
  const [redirectPath, setRedirectPath] = useState(signInRedirect ?? null);

  useEffect(() => {
    if (!signInRedirect) {
      setRedirectPath(`${window.location.pathname}${window.location.search}`);
    }
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [signInRedirect]);

  // On a custom domain, "Sign in" goes through opendocs.cc and back (the
  // sign-in bridge) and lands on the same page.
  const loginHref = customSite
    ? customSignInHref(redirectPath ?? "/")
    : redirectPath
      ? `/login?redirect=${encodeURIComponent(redirectPath)}`
      : "/login";

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-colors duration-200 ${
        scrolled
          ? "border-zinc-200/70 bg-white/80 backdrop-blur-md dark:border-white/[0.08] dark:bg-zinc-950/80"
          : "border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        {customSite ? (
          <WorkspaceIdentity site={customSite} />
        ) : (
          <Link
            href="/"
            aria-label="OpenDocs home"
            className="group inline-flex h-10 flex-none items-center"
          >
            <OpenDocsWordmark />
          </Link>
        )}

        <div className="min-w-0 flex-1">{children}</div>

        <div className="flex flex-none items-center gap-2 sm:gap-2.5">
          {workspaceSlug ? <WorkspaceSearch workspaceSlug={workspaceSlug} /> : null}
          {comments ? <CommentsTrigger canComment={comments.canComment} /> : null}
          {isViewerSignedIn && customSite ? (
            userMenu ? <CustomDomainUserMenu user={userMenu} site={customSite} /> : null
          ) : isViewerSignedIn ? (
            <>
              <Link href="/dashboard" className={`hidden sm:inline-flex ${pillClass}`}>
                Dashboard
              </Link>
              {userMenu ? (
                <PublicUserMenu
                  user={userMenu}
                  currentWorkspaceSlug={workspaceSlug}
                />
              ) : null}
            </>
          ) : (
            <>
              <ThemeDropdownButton />
              {customSite ? (
                // A plain link: the bridge is a chain of full-page redirects.
                <a href={loginHref} className={`inline-flex ${pillClass}`}>
                  Sign in
                </a>
              ) : (
                <Link href={loginHref} className={`inline-flex ${pillClass}`}>
                  Sign in
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
