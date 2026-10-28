import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfilePageShell } from "@/components/profile-page";
import { getReaderSession } from "@/lib/auth/session";
import { getPublicUserMenuData } from "@/lib/public-user-menu";
import { readerPageMetadata, redirectToCustomDomainIfServing } from "@/lib/reader-site";
import { getSiteContext } from "@/lib/site-context";
import { getProfileByWorkspaceSlugFromDb } from "@/lib/workspaces/cached";
import { parsePostSort } from "@opendocs/shared/posts";

type ProjectTagPageProps = {
  params: Promise<{
    workspace: string;
    project: string;
    tag: string;
  }>;
  searchParams: Promise<{
    sort?: string | string[];
  }>;
};

export async function generateMetadata({
  params,
}: ProjectTagPageProps): Promise<Metadata> {
  const { workspace, project, tag } = await params;
  const decodedTag = decodeURIComponent(tag).toLowerCase();
  const [profile, site] = await Promise.all([
    getProfileByWorkspaceSlugFromDb(workspace, null, decodedTag, undefined, project),
    getSiteContext(),
  ]);

  if (!profile || profile.private) return {};

  const displayName = profile.displayName || profile.workspaceSlug;
  return readerPageMetadata(site, `${profile.project.path}/tag/${tag}`, {
    title: `#${decodedTag} - ${profile.project.name} - ${displayName}`,
    description: `Documents tagged #${decodedTag} in ${profile.project.name} on OpenDocs.`,
  });
}

export default async function ProjectTagPage({
  params,
  searchParams,
}: ProjectTagPageProps) {
  const { workspace, project, tag } = await params;
  const { sort: rawSort } = await searchParams;
  const decodedTag = decodeURIComponent(tag).toLowerCase();
  const query = await searchParams;
  const [session, site] = await Promise.all([getReaderSession(), getSiteContext()]);
  // A workspace with a custom domain is read there, every page of it: the
  // reader signs in on the domain (the bridge) for anything not public.
  await redirectToCustomDomainIfServing(site, workspace, `/${workspace}/projects/${project}/tag/${tag}`, query);
  const sortInput = Array.isArray(rawSort) ? rawSort[0] : rawSort;
  const urlSort = parsePostSort(sortInput);

  const [filteredProfile, fullProfile] = await Promise.all([
    getProfileByWorkspaceSlugFromDb(
      workspace,
      session?.user.id ?? null,
      decodedTag,
      urlSort ?? undefined,
      project,
    ),
    getProfileByWorkspaceSlugFromDb(
      workspace,
      session?.user.id ?? null,
      null,
      undefined,
      project,
    ),
  ]);

  if (!filteredProfile || !fullProfile || filteredProfile.private || fullProfile.private) {
    notFound();
  }

  const userMenu = session ? await getPublicUserMenuData(session.user) : null;

  const projectAllTags = Array.from(
    new Set(fullProfile.posts.flatMap((p) => p.tags)),
  );
  const defaultSort = filteredProfile.defaultSort;
  const currentSort = urlSort ?? defaultSort;

  return (
    <ProfilePageShell
      profile={filteredProfile}
      isViewerSignedIn={Boolean(session)}
      userMenu={userMenu}
      activeTag={decodedTag}
      workspaceAllTags={projectAllTags}
      currentSort={currentSort}
      defaultSort={defaultSort}
    />
  );
}
