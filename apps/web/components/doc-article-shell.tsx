import Link from "next/link";
import { ChevronRight, History } from "lucide-react";

import { isSelfHosted } from "@opendocs/shared/config/instance";

import { ArticleBody } from "@/components/article-body";
import { ArticleDownloadButtons } from "@/components/article-download-buttons";
import { ArticleRelatedDocuments } from "@/components/article-related-documents";
import { ArticleShareButton } from "@/components/article-share-button";
import { ArticleToc, type ArticleTocItem } from "@/components/article-toc";
import { ArticleVersionMenu } from "@/components/article-version-menu";
import { DocCommentingLayer } from "@/components/doc-commenting-layer";
import { LastUpdatedTrailer } from "@/components/last-updated-trailer";
import { PublicSiteFooter } from "@/components/public-site-footer";
import { PublicSiteHeader } from "@/components/public-site-header";
import type { PublicUserMenuData } from "@/components/public-user-menu";
import { ReadingProgress } from "@/components/reading-progress";
import { ScrollToTop } from "@/components/scroll-to-top";
import type {
  ArticleVersionOption,
  ArticleVersionView,
} from "@/lib/article-versions";
import { getSiteContext } from "@/lib/site-context";
import { isCustomSite, workspaceHref } from "@/lib/site-paths";
import { getTagColorFor } from "@/lib/tag-colors";

type DocArticleShellProps = {
  post: {
    /** Database ID — passed to the comments client layer for API calls. */
    id: string;
    /**
     * Whether the viewer can leave inline comments. True only for
     * active workspace members. The commenting layer only renders the
     * selection bubble + keyboard shortcut when this is true; readers
     * always see existing-comment highlights.
     */
    canComment: boolean;
    workspaceSlug: string;
    projectSlug: string;
    projectName: string;
    isDefaultProject: boolean;
    url: string;
    workspaceName: string;
    workspaceLogoUrl: string | null;
    ownerUsername: string | null;
    title: string;
    updatedAt: string;
    /**
     * Server-rendered "Last updated" string (UTC) used as the SSR
     * fallback for the bottom trailer. The client component reformats
     * this in the viewer's own locale + timezone on mount when the
     * post is within the recent window.
     */
    updatedAtDisplay: string;
    /** Raw ISO timestamp piped straight to the trailer component. */
    updatedAtIso: string;
    /** Controls whether the trailer reformats into the browser locale. */
    updatedAtIsRecent: boolean;
    readingTime: string;
    renderedHtml: string;
    /** Headings of the live version (H1–H6), for the table of contents. */
    toc: ArticleTocItem[];
    tags: string[];
    /**
     * Workspace-scoped tag ordering → palette index. Used to color the
     * chips above the article title in the same hue they have on the
     * workspace profile page.
     */
    tagColorIndex: Record<string, number>;
    /** Post slug (without workspace prefix) — used by the download buttons. */
    slug: string;
    /**
     * Whether to render the "Download DOCX" button. Pro/Team owners
     * only; free-tier owners don't see it. PDF is always available.
     */
    canExportDocx: boolean;
    /** Readable by anyone (public, in a workspace that allows it). */
    isPublic: boolean;
  };
  isViewerSignedIn: boolean;
  userMenu?: PublicUserMenuData | null;
  /** Absolute API base URL for the download-fetch call. */
  apiBaseUrl: string;
  /**
   * Other posts in the same workspace that share at least one tag
   * with the current post, already access-filtered on the server.
   * Empty array → no section rendered.
   */
  relatedPosts: Array<{
    workspaceSlug: string;
    projectSlug: string;
    isDefaultProject: boolean;
    url: string;
    tagBasePath: string;
    slug: string;
    title: string;
    updatedAt: string;
    readingTime: string;
    tags: string[];
  }>;
  /** Version history (workspace members only; empty for other readers). */
  versions: ArticleVersionOption[];
  /** Set when the reader opened an older version via `?v=N`. */
  viewingVersion: ArticleVersionView | null;
};

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** H2/H3 only: H1 repeats the title and deeper levels clutter the list. */
function tocEntries(toc: ArticleTocItem[]) {
  return toc.filter((item) => item.level === 2 || item.level === 3);
}

/**
 * Article page layout: sticky header, breadcrumb, title block with the
 * version switcher and actions, the rendered Markdown, then related
 * documents. From `xl` up a sticky "On this page" column sits to the
 * right; below that the contents collapse into a box above the body.
 */
export async function DocArticleShell({
  post,
  isViewerSignedIn,
  userMenu = null,
  apiBaseUrl,
  relatedPosts,
  versions,
  viewingVersion,
}: DocArticleShellProps) {
  // On the workspace's custom domain every link drops the /<workspace>
  // prefix (lib/site-paths.ts).
  const site = await getSiteContext();
  const customSite = isCustomSite(site) ? site : null;
  const workspaceInitials = initialsFor(post.workspaceName);
  const workspacePath = workspaceHref(site, `/${post.workspaceSlug}`);
  const projectPath = post.isDefaultProject
    ? workspacePath
    : workspaceHref(site, `/${post.workspaceSlug}/projects/${post.projectSlug}`);
  const tagBasePath = post.isDefaultProject
    ? workspaceHref(site, `/${post.workspaceSlug}/tag`)
    : `${projectPath}/tag`;
  const postPath = workspaceHref(site, post.url);

  const renderedHtml = viewingVersion?.renderedHtml ?? post.renderedHtml;
  const toc = tocEntries(viewingVersion?.toc ?? post.toc);
  const readingTime = viewingVersion?.readingTime ?? post.readingTime;
  const latestVersion = versions.find((version) => version.isCurrent);

  return (
    <div
      className="flex min-h-screen flex-col overflow-x-clip bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100"
      dir="ltr"
    >
      <ReadingProgress />
      <PublicSiteHeader
        workspaceSlug={post.workspaceSlug}
        isViewerSignedIn={isViewerSignedIn}
        userMenu={userMenu}
        comments={viewingVersion ? null : { canComment: post.canComment }}
      />

      <main id="main" className="relative flex-auto">
        <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 sm:pt-10 lg:px-8">
          <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_220px] xl:gap-14">
            <div className="mx-auto w-full min-w-0 max-w-[740px] xl:mx-0 xl:justify-self-center">
              {/* Breadcrumb: workspace › project */}
              <nav aria-label="Breadcrumb" className="mb-5">
                <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                  <li className="min-w-0">
                    <Link
                      href={workspacePath}
                      className="inline-flex min-w-0 items-center gap-2 rounded-md py-0.5 pr-1 font-medium text-zinc-700 transition-colors hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
                    >
                      <span className="flex h-5 w-5 flex-none items-center justify-center overflow-hidden rounded-md bg-zinc-100 ring-1 ring-zinc-900/[0.06] dark:bg-zinc-900 dark:ring-white/10">
                        {post.workspaceLogoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={post.workspaceLogoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[9px] font-semibold text-zinc-500 dark:text-zinc-400">
                            {workspaceInitials}
                          </span>
                        )}
                      </span>
                      <span className="truncate">{post.workspaceName}</span>
                    </Link>
                  </li>
                  {!post.isDefaultProject ? (
                    <>
                      <li aria-hidden="true">
                        <ChevronRight className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600" />
                      </li>
                      <li className="min-w-0">
                        <Link
                          href={projectPath}
                          className="block truncate rounded-md px-1 py-0.5 transition-colors hover:text-zinc-950 dark:hover:text-white"
                        >
                          {post.projectName}
                        </Link>
                      </li>
                    </>
                  ) : null}
                </ol>
              </nav>

              {/* Title + meta */}
              <header className="mb-8">
                <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-balance text-zinc-950 sm:text-[40px] dark:text-white">
                  {post.title}
                </h1>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-500 dark:text-zinc-400">
                  {viewingVersion ? (
                    <span>Published {viewingVersion.createdAtLabel}</span>
                  ) : (
                    <time dateTime={post.updatedAtIso}>Updated {post.updatedAt}</time>
                  )}
                  <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                    ·
                  </span>
                  <span>{readingTime}</span>
                  {post.ownerUsername ? (
                    <>
                      <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                        ·
                      </span>
                      <span>@{post.ownerUsername}</span>
                    </>
                  ) : null}
                  {versions.length > 0 ? (
                    <ArticleVersionMenu
                      versions={versions}
                      viewingVersionNumber={viewingVersion?.versionNumber ?? null}
                    />
                  ) : null}
                </div>
                {post.tags.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {post.tags.map((tag) => {
                      // Same workspace tag hue as on the profile page.
                      const color = getTagColorFor(tag, post.tagColorIndex);
                      return (
                        <Link
                          key={tag}
                          href={`${tagBasePath}/${encodeURIComponent(tag)}`}
                          className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${color.base} ${color.hover}`}
                        >
                          {tag}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
                {/* Actions. Downloads always export the live version, so
                    they are hidden while an older version is on screen. */}
                <div className="mt-6 flex flex-wrap items-center gap-2.5">
                  {viewingVersion ? null : (
                    <ArticleDownloadButtons
                      workspaceSlug={post.workspaceSlug}
                      projectSlug={post.isDefaultProject ? null : post.projectSlug}
                      postSlug={post.slug}
                      canExportDocx={post.canExportDocx}
                      apiBaseUrl={apiBaseUrl}
                    />
                  )}
                  <ArticleShareButton path={postPath} title={post.title} />
                </div>
              </header>

              {viewingVersion ? (
                <div
                  role="status"
                  className="mb-8 flex flex-col gap-3 rounded-xl bg-amber-50 px-4 py-3.5 text-sm text-amber-950 ring-1 ring-amber-200/80 sm:flex-row sm:items-center sm:justify-between dark:bg-amber-400/[0.08] dark:text-amber-100 dark:ring-amber-400/20"
                >
                  <p className="flex items-start gap-2.5">
                    <History className="mt-0.5 h-4 w-4 flex-none opacity-70" aria-hidden="true" />
                    <span>
                      You&apos;re reading version {viewingVersion.versionNumber}
                      {latestVersion
                        ? ` of ${latestVersion.versionNumber}`
                        : ""}
                      , published {viewingVersion.createdAtLabel}. Comments and
                      downloads use the latest version.
                    </span>
                  </p>
                  <Link
                    href={postPath}
                    className="inline-flex flex-none items-center justify-center rounded-full bg-amber-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100"
                  >
                    View latest
                  </Link>
                </div>
              ) : null}

              <div className="xl:hidden">
                <ArticleToc items={toc} variant="inline" />
              </div>

              {/* Article body — `od-mkdocs` + `md-typeset` keep the heading
                  permalinks and rehype-pretty-code highlighting CSS working.
                  `data-od-comment-root` marks the element the commenting
                  layer scans; it is left off older versions because
                  comment anchors belong to the live text. */}
              <div className="od-mkdocs">
                <article
                  className="md-typeset"
                  data-od-comment-root={viewingVersion ? undefined : "1"}
                >
                  <ArticleBody html={renderedHtml} />
                </article>
              </div>

              {/* Commenting layer — side panel, selection bubble and
                  ⌘⌥M shortcut. Readers who can't comment still see
                  existing threads. Not mounted on older versions. */}
              {viewingVersion ? null : (
                <DocCommentingLayer
                  postId={post.id}
                  canComment={post.canComment}
                  isViewerSignedIn={isViewerSignedIn}
                />
              )}

              {/* Related documents — outside the `od-mkdocs` scope so the
                  Markdown typography doesn't cascade into these rows. */}
              <ArticleRelatedDocuments posts={relatedPosts} />

              {/* Locale-aware "Last updated" line; `updatedAtDisplay` is
                  the UTC fallback for SSR and crawlers. */}
              {viewingVersion ? null : (
                <LastUpdatedTrailer
                  updatedAtIso={post.updatedAtIso}
                  serverFallback={post.updatedAtDisplay}
                  isRecent={post.updatedAtIsRecent}
                />
              )}

              {/* One quiet line for readers outside the workspace: every
                  shared document is how most people first see OpenDocs.
                  Not shown to members, or on Pro and Team workspaces'
                  documents (`canExportDocx` is the paid-workspace flag). */}
              {!post.canComment && !post.canExportDocx && !customSite && !isSelfHosted() ? (
                <p className="mt-10 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  Published with{" "}
                  <a
                    href={`/?utm_source=doc&utm_medium=product&utm_content=${encodeURIComponent(post.workspaceSlug)}`}
                    className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-[#6b3fc9] hover:decoration-[#6b3fc9] dark:text-zinc-300 dark:decoration-zinc-600"
                  >
                    OpenDocs
                  </a>
                  , where AI agents publish Markdown as links and PDFs.{" "}
                  <a
                    href={`/?utm_source=doc&utm_medium=product&utm_content=${encodeURIComponent(post.workspaceSlug)}`}
                    className="font-medium text-[#6b3fc9] hover:underline dark:text-[#a78bfa]"
                  >
                    Publish your own
                  </a>
                </p>
              ) : null}
            </div>

            <aside className="hidden xl:block">
              <div className="sticky top-24">
                <ArticleToc items={toc} variant="sidebar" />
              </div>
            </aside>
          </div>
        </div>
      </main>

      <PublicSiteFooter />

      {/* Floating scroll-to-top once the reader is past the title. */}
      <ScrollToTop />
    </div>
  );
}
