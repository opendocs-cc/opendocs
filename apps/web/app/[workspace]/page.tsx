import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";

import { ProfilePageShell } from "@/components/profile-page";
import { PublicSiteFooter } from "@/components/public-site-footer";
import { PublicSiteHeader } from "@/components/public-site-header";
import { getReaderSession } from "@/lib/auth/session";
import { getPublicUserMenuData } from "@/lib/public-user-menu";
import {
  readerPageMetadata,
  redirectToCustomDomainIfServing,
  redirectToCustomSignIn,
} from "@/lib/reader-site";
import { getSiteContext } from "@/lib/site-context";
import { customSignInHref, isCustomSite } from "@/lib/site-paths";
import { getProfileByWorkspaceSlugFromDb } from "@/lib/workspaces/cached";
import { parsePostSort } from "@opendocs/shared/posts";

type WorkspacePageProps = {
  params: Promise<{
    workspace: string;
  }>;
  searchParams: Promise<{
    sort?: string | string[];
  }>;
};

export async function generateMetadata({
  params,
}: WorkspacePageProps): Promise<Metadata> {
  const { workspace } = await params;
  // As the reader sees it: members of a private workspace get its name in
  // the title, not "Private workspace". (getReaderSession is cached per
  // request, so the page reuses it.)
  const [session, site] = await Promise.all([getReaderSession(), getSiteContext()]);
  const profile = await getProfileByWorkspaceSlugFromDb(workspace, session?.user.id ?? null);

  if (!profile) return {};

  if (profile.private) {
    return readerPageMetadata(site, `/${profile.workspaceSlug}`, {
      title: "Private workspace",
      description: "This workspace is private.",
    });
  }

  const displayName = profile.displayName || profile.workspaceSlug;
  return readerPageMetadata(site, `/${profile.workspaceSlug}`, {
    title: displayName,
    description: isCustomSite(site)
      ? `Documents from ${displayName}`
      : `${displayName}'s published documents on OpenDocs`,
  });
}

export default async function WorkspacePage({
  params,
  searchParams,
}: WorkspacePageProps) {
  const { workspace } = await params;
  const query = await searchParams;
  const { sort: rawSort } = query;
  const [session, site] = await Promise.all([getReaderSession(), getSiteContext()]);
  // A workspace with a custom domain is read there, every page of it: the
  // reader signs in on the domain (the bridge) for anything not public.
  await redirectToCustomDomainIfServing(site, workspace, `/${workspace}`, query);

  // Parse the URL `?sort=` first — `parsePostSort` returns null for
  // unknown values so a malformed URL silently falls through to the
  // workspace default rather than 500-ing. `Array.isArray` guards
  // against `?sort=a&sort=b`, which Next gives us as an array.
  const sortInput = Array.isArray(rawSort) ? rawSort[0] : rawSort;
  const urlSort = parsePostSort(sortInput);

  // First fetch — use the URL sort if provided. We can't do the full
  // cascade (URL → workspace → global) until we know the workspace
  // default, which lives behind the same query. Pass `urlSort ??
  // undefined` so the service uses its own default-from-workspace
  // logic when the URL doesn't override.
  const profile = await getProfileByWorkspaceSlugFromDb(
    workspace,
    session?.user.id ?? null,
    null,
    urlSort ?? undefined,
  );

  if (!profile) {
    notFound();
  }

  // On a custom domain, a private workspace asks the reader to sign in
  // through opendocs.cc first.
  if (profile.private && !session) await redirectToCustomSignIn(site, `/${workspace}`, query);
  const userMenu = session ? await getPublicUserMenuData(session.user) : null;

  // Private workspace — show a gated page that mirrors the public
  // workspace shell (white card on zinc-50, real OpenDocs wordmark,
  // sign-in pill in the top-right) so the visual language stays
  // consistent across states. The body content is replaced with a
  // centered "locked" empty-state plus a prominent CTA. We don't
  // surface workspace name / logo / owner here on purpose: the
  // service intentionally returns only the slug for non-members so
  // we don't leak workspace metadata, and that's a security feature
  // worth preserving in the UI.
  if (profile.private) {
    const loginUrl = session
      ? null // Signed-in but not a member — sign-in won't help, route to dashboard.
      : isCustomSite(site)
        ? customSignInHref("/")
        : `/login?redirect=${encodeURIComponent(`/${workspace}`)}`;

    return (
      <div className="flex min-h-screen flex-col bg-white antialiased dark:bg-zinc-950">
        {/* No search in the header: there is nothing a non-member can
            search here. The service returns only the slug for
            non-members, so we deliberately show no workspace name,
            logo or owner. */}
        <PublicSiteHeader
          isViewerSignedIn={Boolean(session)}
          userMenu={userMenu}
          signInRedirect={`/${workspace}`}
        />

        <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 sm:px-8">
          <div className="mx-auto w-full max-w-md text-center">
            <div
              aria-hidden="true"
              className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 ring-1 ring-zinc-900/[0.06] dark:bg-zinc-900 dark:ring-white/10"
            >
              <Lock className="h-5 w-5 text-zinc-500" strokeWidth={1.75} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-3xl dark:text-white">
              This workspace is private
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-pretty text-zinc-600 sm:text-base dark:text-zinc-400">
              {session
                ? "You don't have access to this workspace. Ask the owner for an invitation, or head back to your dashboard."
                : "Sign in with the email that was invited to this workspace to view its documents."}
            </p>
            <div className="mx-auto mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <a
                href={loginUrl ?? (isCustomSite(site) ? `${site.opendocsOrigin}/dashboard` : "/dashboard")}
                className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 active:scale-[0.98] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {loginUrl ? "Sign in to continue" : "Go to dashboard"}
              </a>
              <Link
                href={isCustomSite(site) ? site.opendocsOrigin : "/"}
                className="inline-flex h-10 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-900/10 transition hover:text-zinc-950 hover:ring-zinc-900/20 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-white/10"
              >
                {isCustomSite(site) ? "Go to OpenDocs" : "Back to home"}
              </Link>
            </div>
          </div>
        </main>

        <PublicSiteFooter />
      </div>
    );
  }

  // Now we know the workspace's stored default. The cascade resolves:
  // URL override → workspace default → global default (already baked
  // into `profile.defaultSort` via the service).
  const defaultSort = profile.defaultSort;
  const currentSort = urlSort ?? defaultSort;

  return (
    <ProfilePageShell
      profile={profile}
      isViewerSignedIn={Boolean(session)}
      userMenu={userMenu}
      currentSort={currentSort}
      defaultSort={defaultSort}
    />
  );
}
