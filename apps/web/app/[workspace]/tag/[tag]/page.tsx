import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";

import { ProfilePageShell } from "@/components/profile-page";
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

type TagPageProps = {
  params: Promise<{
    workspace: string;
    tag: string;
  }>;
  searchParams: Promise<{
    sort?: string | string[];
  }>;
};

export async function generateMetadata({
  params,
}: TagPageProps): Promise<Metadata> {
  const { workspace, tag } = await params;
  const decodedTag = decodeURIComponent(tag).toLowerCase();
  const [profile, site] = await Promise.all([
    getProfileByWorkspaceSlugFromDb(workspace, null),
    getSiteContext(),
  ]);

  if (!profile) return {};

  if (profile.private) {
    return readerPageMetadata(site, `/${profile.workspaceSlug}/tag/${tag}`, {
      title: "Private workspace",
      description: "This workspace is private.",
    });
  }

  const displayName = profile.displayName || profile.workspaceSlug;
  return readerPageMetadata(site, `/${profile.workspaceSlug}/tag/${tag}`, {
    title: `#${decodedTag} — ${displayName}`,
    description: `Documents tagged #${decodedTag} in ${displayName}'s workspace on OpenDocs.`,
  });
}

export default async function TagPage({
  params,
  searchParams,
}: TagPageProps) {
  const { workspace, tag } = await params;
  const { sort: rawSort } = await searchParams;
  // URL may arrive percent-encoded (e.g. if a tag ever contains spaces).
  // The DB stores lowercased tags, so normalize both sides the same way.
  const decodedTag = decodeURIComponent(tag).toLowerCase();
  const query = await searchParams;
  const [session, site] = await Promise.all([getReaderSession(), getSiteContext()]);
  // A workspace with a custom domain is read there, every page of it: the
  // reader signs in on the domain (the bridge) for anything not public.
  await redirectToCustomDomainIfServing(site, workspace, `/${workspace}/tag/${tag}`, query);

  // Same sort cascade as `/[workspace]/page.tsx` — URL `?sort=` wins
  // for this request; otherwise the service applies the workspace's
  // stored default. We can't know that default until the fetch
  // resolves, so we pass the URL value (or undefined) through.
  const sortInput = Array.isArray(rawSort) ? rawSort[0] : rawSort;
  const urlSort = parsePostSort(sortInput);

  // We issue two fetches: one tag-filtered (for the post list) and one
  // unfiltered (for the sidebar Topics cloud + the workspace hero meta).
  // The second call reuses the same cached function so it's cheap — it
  // just gives us the full list of tags across the workspace. Sort is
  // only applied to the filtered fetch — the unfiltered one only
  // contributes the tag set, which is order-agnostic.
  const [filteredProfile, fullProfile] = await Promise.all([
    getProfileByWorkspaceSlugFromDb(
      workspace,
      session?.user.id ?? null,
      decodedTag,
      urlSort ?? undefined,
    ),
    getProfileByWorkspaceSlugFromDb(workspace, session?.user.id ?? null),
  ]);

  if (!filteredProfile || !fullProfile) {
    notFound();
  }

  // Private workspace — same gate as the root workspace page. The tag
  // route mirrors `/[workspace]/page.tsx`'s private-profile branch so
  // that linking to a tag in a private workspace behaves identically.
  if (filteredProfile.private || fullProfile.private) {
    // On a custom domain, sign in through opendocs.cc and come back.
    if (!session) await redirectToCustomSignIn(site, `/${workspace}/tag/${tag}`, query);
    const loginUrl = session
      ? null
      : isCustomSite(site)
        ? customSignInHref(`/tag/${tag}`)
        : `/login?redirect=${encodeURIComponent(`/${workspace}/tag/${tag}`)}`;

    return (
      <div className="min-h-screen bg-[#fafafa]">
        <nav className="border-b border-[#e5e5e5] bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="text-xl text-[#171717] font-semibold">
                OpenDocs
              </Link>
            </div>
          </div>
        </nav>
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
          <div className="max-w-md w-full mx-auto px-6 text-center">
            <div className="bg-white rounded-xl border border-[#e5e5e5] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] p-8">
              <div className="w-12 h-12 bg-[#f5f5f5] rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-6 h-6 text-[#737373]" />
              </div>
              <h1 className="text-[20px] font-semibold text-[#171717] mb-2">
                This workspace is private
              </h1>
              <p className="text-[16px] text-[#525252] leading-[24px] mb-6">
                {session
                  ? "You don't have access to this workspace. Contact the workspace owner to request an invitation."
                  : "Sign in to see if you have access to this workspace."}
              </p>
              {loginUrl ? (
                <Link
                  href={loginUrl}
                  className="inline-flex items-center justify-center bg-[#7F56D9] hover:bg-[#6941C6] text-white rounded-[8px] px-6 py-2.5 text-[16px] font-semibold transition-colors"
                >
                  Sign in
                </Link>
              ) : (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center border border-[#d4d4d4] text-[#404040] hover:bg-[#f5f5f5] rounded-[8px] px-6 py-2.5 text-[16px] font-medium transition-colors"
                >
                  Go to dashboard
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const userMenu = session ? await getPublicUserMenuData(session.user) : null;

  // Full topic cloud across the whole workspace — preserved so users can
  // jump from one tag to another via the sidebar without first going
  // back to the workspace root.
  const workspaceAllTags = Array.from(
    new Set(fullProfile.posts.flatMap((p) => p.tags)),
  );

  // Cascade resolves now that the workspace default is known.
  const defaultSort = filteredProfile.defaultSort;
  const currentSort = urlSort ?? defaultSort;

  return (
    <ProfilePageShell
      profile={filteredProfile}
      isViewerSignedIn={Boolean(session)}
      userMenu={userMenu}
      activeTag={decodedTag}
      workspaceAllTags={workspaceAllTags}
      currentSort={currentSort}
      defaultSort={defaultSort}
    />
  );
}
