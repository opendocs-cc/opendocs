import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfilePageShell } from "@/components/profile-page";
import { RestrictedPostView } from "@/components/restricted-post-view";
import { getReaderSession } from "@/lib/auth/session";
import { getPublicUserMenuData } from "@/lib/public-user-menu";
import {
  readerPageMetadata,
  redirectToCustomDomainIfServing,
  redirectToCustomSignIn,
} from "@/lib/reader-site";
import { getSiteContext } from "@/lib/site-context";
import { getProfileByWorkspaceSlugFromDb } from "@/lib/workspaces/cached";
import { parsePostSort } from "@opendocs/shared/posts";

type ProjectPageProps = {
  params: Promise<{
    workspace: string;
    project: string;
  }>;
  searchParams: Promise<{
    sort?: string | string[];
  }>;
};

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { workspace, project } = await params;
  const [session, site] = await Promise.all([getReaderSession(), getSiteContext()]);
  const profile = await getProfileByWorkspaceSlugFromDb(
    workspace,
    session?.user.id ?? null,
    null,
    undefined,
    project,
  );

  if (!profile || profile.private) return {};

  const displayName = profile.displayName || profile.workspaceSlug;
  return readerPageMetadata(site, profile.project.path, {
    title: `${profile.project.name} - ${displayName}`,
    description: `Documents in ${profile.project.name} from ${displayName} on OpenDocs.`,
  });
}

export default async function ProjectPage({
  params,
  searchParams,
}: ProjectPageProps) {
  const { workspace, project } = await params;
  const query = await searchParams;
  const { sort: rawSort } = query;
  const [session, site] = await Promise.all([getReaderSession(), getSiteContext()]);
  // A workspace with a custom domain is read there, every page of it: the
  // reader signs in on the domain (the bridge) for anything not public.
  await redirectToCustomDomainIfServing(site, workspace, `/${workspace}/projects/${project}`, query);
  const sortInput = Array.isArray(rawSort) ? rawSort[0] : rawSort;
  const urlSort = parsePostSort(sortInput);

  const profile = await getProfileByWorkspaceSlugFromDb(
    workspace,
    session?.user.id ?? null,
    null,
    urlSort ?? undefined,
    project,
  );

  if (!profile) {
    notFound();
  }

  if (profile.private) {
    // On a custom domain, sign in through opendocs.cc and come back.
    if (!session) await redirectToCustomSignIn(site, `/${workspace}/projects/${project}`, query);
    return (
      <RestrictedPostView
        redirectPath={`/${workspace}/projects/${project}`}
        resource="project"
        isViewerSignedIn={Boolean(session)}
      />
    );
  }

  const userMenu = session ? await getPublicUserMenuData(session.user) : null;
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
