import Link from "next/link";
import { FileText, Hash, X } from "lucide-react";

import { CopyWorkspaceUrl } from "@/components/copy-workspace-url";
import { LocalizedProfileUpdatedAt } from "@/components/localized-profile-updated-at";
import { ProfileArticlesList } from "@/components/profile-articles-list";
import { ProfileSearchField } from "@/components/profile-search-field";
import { ProfileSortControl } from "@/components/profile-sort-control";
import {
  ProjectCountButton,
  ProjectPicker,
  ProjectPickerTabButton,
} from "@/components/project-picker";
import { ProjectTabsNav } from "@/components/project-tabs-nav";
import { PublicSiteFooter } from "@/components/public-site-footer";
import { PublicSiteHeader } from "@/components/public-site-header";
import type { PublicUserMenuData } from "@/components/public-user-menu";
import { ScrollToTop } from "@/components/scroll-to-top";
import { WorkspaceDownloadAll } from "@/components/workspace-download-all";
import { profileForSite } from "@/lib/reader-site";
import { getSiteContext } from "@/lib/site-context";
import { isCustomSite, workspaceHref } from "@/lib/site-paths";
import { getTagColorFor } from "@/lib/tag-colors";
import { instanceHost } from "@opendocs/shared/config/instance";
import { DEFAULT_POST_SORT, type PostSort } from "@opendocs/shared/posts/sort";

type ProfilePost = {
  workspaceSlug: string;
  url: string;
  tagBasePath: string;
  projectSlug: string;
  projectName: string;
  isDefaultProject: boolean;
  slug: string;
  title: string;
  summary: string;
  updatedAt: string;
  updatedAtIso: string;
  updatedAtIsRecent: boolean;
  readingTime: string;
  tags: string[];
};

type ProfilePageShellProps = {
  profile: {
    workspaceSlug: string;
    workspaceName: string;
    username: string | null;
    displayName: string;
    bio: string | null;
    logoUrl: string | null;
    allowPublicDocuments: boolean;
    createdAt: string;
    scope: "workspace" | "project";
    project: {
      id: string;
      slug: string;
      name: string;
      isDefault: boolean;
      path: string;
    };
    projects: Array<{
      id: string;
      slug: string;
      name: string;
      isDefault: boolean;
      path: string;
      postCount: number;
    }>;
    posts: ProfilePost[];
    /**
     * Workspace-scoped first-seen order of tags — each tag maps to an
     * integer index that picks its color from `lib/tag-colors`. Computed
     * server-side by `getWorkspaceTagOrderMap`.
     */
    tagColorIndex: Record<string, number>;
  };
  isViewerSignedIn: boolean;
  userMenu?: PublicUserMenuData | null;
  /**
   * When set, this shell is rendering the `/[workspace]/tag/[tag]` page
   * — posts are already server-filtered, but we still want to visually
   * communicate "you're looking at a subset" via a filter chip above the
   * list and a highlighted chip in the sidebar Topics cloud. The chip in
   * the sidebar serves double duty as a "clear filter" toggle since
   * clicking it navigates back to the root workspace page.
   */
  activeTag?: string | null;
  /**
   * Full workspace topic list. Only relevant on the tag page, where
   * `profile.posts` is server-filtered and would otherwise yield an
   * incomplete Topics cloud. Omit on the root workspace page — the
   * shell derives the list from posts in that case.
   */
  workspaceAllTags?: string[];
  /**
   * The active article sort. Drives the dropdown's `value` and the
   * order the server already used for `profile.posts`. Resolved by
   * the route from the URL `?sort=` param → workspace defaultSort →
   * `DEFAULT_POST_SORT` cascade.
   */
  currentSort?: PostSort;
  /**
   * The workspace's stored default sort. Used by the dropdown to
   * decide whether picking the current sort should strip the URL
   * `?sort=` param (when matching the workspace default) or keep it
   * in the URL (when overriding).
   */
  defaultSort?: PostSort;
};

/**
 * From this many projects the tab strip usually overflows, so the sticky
 * bar gets its own button for the project picker.
 */
const PICKER_IN_TAB_BAR_FROM = 5;

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Public workspace profile (`/[workspace]`, `/[workspace]/projects/[p]`
 * and the tag pages). Layout: a left-aligned hero with the workspace
 * identity and a search field, project tabs that stick under the header,
 * then the document list with a sticky sidebar (topics, about, download).
 * On small screens the sidebar drops below the list.
 */
export async function ProfilePageShell({
  profile: profileInput,
  isViewerSignedIn,
  userMenu = null,
  activeTag = null,
  workspaceAllTags,
  currentSort = DEFAULT_POST_SORT,
  defaultSort = DEFAULT_POST_SORT,
}: ProfilePageShellProps) {
  // Every link below comes out of profileForSite or workspaceHref, so on
  // the workspace's custom domain it drops the /<workspace> prefix.
  const site = await getSiteContext();
  const profile = profileForSite(profileInput, site);
  const initials = initialsFor(profile.workspaceName);

  // Dedup tags across all posts for the sidebar "Topics" cloud.
  // Preserve first-seen order so recently-updated posts surface their
  // tags first. On the tag page, `workspaceAllTags` is passed explicitly
  // since `profile.posts` has been server-filtered to a subset.
  const allTags =
    workspaceAllTags ??
    Array.from(new Set(profile.posts.flatMap((p) => p.tags)));
  const normalizedActiveTag = activeTag?.toLowerCase() ?? null;
  const profilePath = profile.project.path;
  const tagBasePath =
    profile.scope === "workspace"
      ? workspaceHref(site, `/${profile.workspaceSlug}/tag`)
      : `${profilePath === "/" ? "" : profilePath}/tag`;

  const postCount = profile.posts.length;
  const totalProjectPostCount = profile.projects.reduce(
    (total, project) => total + project.postCount,
    0,
  );
  const hasMultipleProjects = profile.projects.length > 1;
  const showProjectLabels =
    profile.scope === "workspace" && hasMultipleProjects;
  const latestPost = [...profile.posts].sort((a, b) =>
    b.updatedAtIso.localeCompare(a.updatedAtIso),
  )[0];
  const ownerHandle = profile.username ? `@${profile.username}` : null;
  const visibilityLabel = profile.allowPublicDocuments
    ? "Public"
    : "Members only";

  // Project tabs: "All" plus every project, in the service's order.
  const tabs = [
    {
      key: "all",
      label: "All",
      href: workspaceHref(site, `/${profile.workspaceSlug}`),
      count: totalProjectPostCount,
      isActive: profile.scope === "workspace",
    },
    ...profile.projects.map((project) => ({
      key: project.id,
      label: project.name,
      href: project.path,
      count: project.postCount,
      isActive:
        profile.scope === "project" && project.slug === profile.project.slug,
    })),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      {/* Soft wash behind the hero; purely decorative. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_20%_0%,rgba(127,86,217,0.07),transparent_70%)] dark:bg-[radial-gradient(60%_100%_at_20%_0%,rgba(167,139,250,0.08),transparent_70%)]"
      />

      <PublicSiteHeader
        workspaceSlug={profile.workspaceSlug}
        isViewerSignedIn={isViewerSignedIn}
        userMenu={userMenu}
      />

      <main id="main" className="relative flex-auto">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-8 pt-8 sm:px-6 sm:pt-12 lg:px-8">
          <div className="flex items-start gap-4 sm:gap-5">
            <div className="h-14 w-14 flex-none overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-900/[0.06] sm:h-[72px] sm:w-[72px] dark:bg-zinc-900 dark:ring-white/10">
              {profile.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.logoUrl}
                  alt={`${profile.workspaceName} logo`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-zinc-500 sm:text-xl dark:text-zinc-400">
                  {initials}
                </div>
              )}
            </div>
            <div className="min-w-0 pt-0.5">
              <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-balance text-zinc-950 sm:text-[40px] dark:text-white">
                {profile.displayName}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
                <CopyWorkspaceUrl
                  displayUrl={
                    isCustomSite(site) ? site.hostname : `${instanceHost()}/${profile.workspaceSlug}`
                  }
                />
                {ownerHandle ? (
                  <span>
                    by{" "}
                    <span className="font-medium text-zinc-700 dark:text-zinc-200">
                      {ownerHandle}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {profile.bio ? (
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-pretty text-zinc-600 sm:text-base dark:text-zinc-300">
              {profile.bio}
            </p>
          ) : null}

          <div className="mt-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <ProfileSearchField placeholder="Search this workspace" />
            <dl className="flex items-center gap-6 text-sm">
              <div>
                <dt className="sr-only">Documents</dt>
                <dd className="text-zinc-500 dark:text-zinc-400">
                  <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {totalProjectPostCount || postCount}
                  </span>{" "}
                  {(totalProjectPostCount || postCount) === 1 ? "document" : "documents"}
                </dd>
              </div>
              {hasMultipleProjects ? (
                <div>
                  <dt className="sr-only">Projects</dt>
                  <dd>
                    <ProjectCountButton count={profile.projects.length} />
                  </dd>
                </div>
              ) : null}
              {latestPost ? (
                <div className="hidden md:block">
                  <dt className="sr-only">Last updated</dt>
                  <dd className="text-zinc-500 dark:text-zinc-400">
                    Updated{" "}
                    <LocalizedProfileUpdatedAt
                      updatedAtIso={latestPost.updatedAtIso}
                      serverFallback={latestPost.updatedAt}
                      isRecent={latestPost.updatedAtIsRecent}
                    />
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </section>

        {/* Project tabs + sort. Sticks under the header on long lists. */}
        <div className="sticky top-16 z-30 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md dark:border-white/[0.08] dark:bg-zinc-950/90">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            {hasMultipleProjects ? (
              <ProjectTabsNav>
                {tabs.map((tab) => (
                  <Link
                    key={tab.key}
                    href={tab.href}
                    aria-current={tab.isActive ? "page" : undefined}
                    className={`group inline-flex flex-none items-center gap-1.5 border-b-2 px-2.5 py-3 text-sm font-medium transition-colors ${
                      tab.isActive
                        ? "border-zinc-900 text-zinc-950 dark:border-white dark:text-white"
                        : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`rounded-full px-1.5 py-px text-[11px] tabular-nums ${
                        tab.isActive
                          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                          : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </Link>
                ))}
              </ProjectTabsNav>
            ) : (
              <h2 className="py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {profile.scope === "project"
                  ? profile.project.name
                  : "Documents"}
                <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-px text-[11px] tabular-nums text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {postCount}
                </span>
              </h2>
            )}
            {profile.projects.length >= PICKER_IN_TAB_BAR_FROM ? (
              <ProjectPickerTabButton />
            ) : null}
            {profile.posts.length > 1 ? (
              <div className="hidden flex-none py-2 sm:block">
                <ProfileSortControl
                  currentSort={currentSort}
                  defaultSort={defaultSort}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-4 pb-8 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-16 lg:px-8">
          <section aria-label="Documents" className="min-w-0">
            {/* On phones the sort control moves out of the sticky tab
                bar so the project tabs get the full width. */}
            {profile.posts.length > 1 ? (
              <div className="mb-1 flex justify-end sm:hidden">
                <ProfileSortControl
                  currentSort={currentSort}
                  defaultSort={defaultSort}
                />
              </div>
            ) : null}
            {normalizedActiveTag ? (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                <span>Tagged</span>
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                    getTagColorFor(normalizedActiveTag, profile.tagColorIndex)
                      .active
                  }`}
                >
                  {normalizedActiveTag}
                </span>
                <span className="tabular-nums">
                  · {postCount} {postCount === 1 ? "document" : "documents"}
                </span>
                <Link
                  href={profilePath}
                  className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  Clear filter
                </Link>
              </div>
            ) : null}

            {profile.posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 px-6 py-16 text-center dark:border-zinc-800">
                <div
                  aria-hidden="true"
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900"
                >
                  {normalizedActiveTag ? (
                    <Hash className="h-5 w-5 text-zinc-400" strokeWidth={1.75} />
                  ) : (
                    <FileText className="h-5 w-5 text-zinc-400" strokeWidth={1.75} />
                  )}
                </div>
                <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                  {normalizedActiveTag
                    ? `No documents tagged ${normalizedActiveTag}`
                    : profile.scope === "project"
                      ? `Nothing in ${profile.project.name} yet`
                      : "No documents yet"}
                </p>
                <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
                  {normalizedActiveTag ? (
                    <>
                      <Link
                        href={profilePath}
                        className="font-medium text-primary hover:underline dark:text-violet-300"
                      >
                        Browse all documents
                      </Link>{" "}
                      in this workspace.
                    </>
                  ) : (
                    "Documents published to this workspace will show up here."
                  )}
                </p>
              </div>
            ) : (
              <ProfileArticlesList
                posts={profile.posts}
                showProjectLabels={showProjectLabels}
              />
            )}
          </section>

          <aside className="flex flex-col gap-8 lg:sticky lg:top-[136px] lg:self-start">
            {allTags.length > 0 ? (
              <section aria-labelledby="topics-heading">
                <h2
                  id="topics-heading"
                  className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  Topics
                </h2>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {allTags.map((tag) => {
                    const isActive = tag.toLowerCase() === normalizedActiveTag;
                    // Clicking the active tag clears the filter; any
                    // other tag navigates to its tag page. The hue comes
                    // from the workspace's tag order so a tag keeps its
                    // color here, on the article page and in search.
                    const href = isActive
                      ? profilePath
                      : `${tagBasePath}/${encodeURIComponent(tag)}`;
                    const color = getTagColorFor(tag, profile.tagColorIndex);
                    return (
                      <Link
                        key={tag}
                        href={href}
                        aria-current={isActive ? "page" : undefined}
                        className={
                          isActive
                            ? `inline-block rounded-md px-2 py-0.5 text-xs font-medium ${color.active}`
                            : `inline-block rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${color.base} ${color.hover}`
                        }
                      >
                        {tag}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section
              aria-labelledby="about-heading"
              className="rounded-2xl bg-zinc-50 p-5 ring-1 ring-zinc-900/[0.04] dark:bg-zinc-900/60 dark:ring-white/[0.06]"
            >
              <h2
                id="about-heading"
                className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
              >
                About
              </h2>
              <dl className="mt-3 space-y-2 text-sm">
                {ownerHandle ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500 dark:text-zinc-400">Owner</dt>
                    <dd className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                      {ownerHandle}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">Documents</dt>
                  <dd className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                    {totalProjectPostCount || postCount}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">Created</dt>
                  <dd className="font-medium text-zinc-800 dark:text-zinc-200">
                    {profile.createdAt}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">Visibility</dt>
                  <dd className="font-medium text-zinc-800 dark:text-zinc-200">
                    {visibilityLabel}
                  </dd>
                </div>
              </dl>
              {/* Download-all is gated on visible posts. The API enforces
                  per-viewer access; the button is just noise when this
                  page has nothing available to download. */}
              {postCount > 0 ? (
                <WorkspaceDownloadAll workspaceSlug={profile.workspaceSlug} />
              ) : null}
            </section>
          </aside>
        </div>
      </main>

      <PublicSiteFooter />

      {hasMultipleProjects ? (
        <ProjectPicker
          entries={tabs.map(({ key, label, href, count, isActive }) => ({
            key,
            label: key === "all" ? "All projects" : label,
            href,
            count,
            isActive,
          }))}
        />
      ) : null}

      {/* Floating scroll-to-top for long lists; hides itself near the top. */}
      <ScrollToTop />
    </div>
  );
}
