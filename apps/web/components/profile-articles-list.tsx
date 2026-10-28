"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Folder } from "lucide-react";

import { LocalizedProfileUpdatedAt } from "@/components/localized-profile-updated-at";
import { useSite } from "@/components/site-provider";
import { workspaceHref } from "@/lib/site-paths";

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

type ProfileArticlesListProps = {
  posts: ProfilePost[];
  showProjectLabels?: boolean;
};

/**
 * Initial number of articles rendered to the DOM. Enough to fill the
 * first couple of screens without paying for hundreds of rows on
 * workspaces with large back catalogues.
 */
const INITIAL_VISIBLE = 20;

/**
 * How many additional posts each "Load more" press reveals. The whole
 * post list is already on the client, so this is purely a render budget,
 * not a network round-trip.
 */
const LOAD_MORE_STEP = 20;

/**
 * Client-side paginated document list for the workspace profile page.
 *
 * The server still ships the full post array (so tag pages keep working
 * without a separate fetch path), but only the first `INITIAL_VISIBLE`
 * rows are rendered. Workspace search uses its own lazy index, so
 * pagination here doesn't hide anything from search.
 *
 * Each row is one stretched link (the title's `::after` covers the row)
 * with the project and tag links raised above it, so the whole row is a
 * click target without nesting anchors.
 */
export function ProfileArticlesList({
  posts,
  showProjectLabels = false,
}: ProfileArticlesListProps) {
  const site = useSite();
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const visiblePosts = posts.slice(0, visibleCount);
  const remainingCount = posts.length - visibleCount;
  const hasMore = remainingCount > 0;

  return (
    <>
      <ul className="-mx-3 flex flex-col">
        {visiblePosts.map((post) => (
          <li key={post.url}>
            <article className="group relative flex items-start gap-4 rounded-xl px-3 py-4 transition-colors duration-200 hover:bg-zinc-50 sm:py-5 dark:hover:bg-white/[0.03]">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold leading-snug tracking-[-0.01em] text-zinc-900 sm:text-[17px] dark:text-zinc-100">
                  <Link
                    href={post.url}
                    className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary/50"
                  >
                    {post.title}
                  </Link>
                </h2>
                {post.summary ? (
                  <p className="mt-1.5 line-clamp-2 max-w-[68ch] text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {post.summary}
                  </p>
                ) : null}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-zinc-500 dark:text-zinc-500">
                  {showProjectLabels && !post.isDefaultProject ? (
                    <>
                      <Link
                        href={workspaceHref(site, `/${post.workspaceSlug}/projects/${post.projectSlug}`)}
                        className="relative z-10 inline-flex items-center gap-1 font-medium text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
                      >
                        <Folder className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.8} />
                        {post.projectName}
                      </Link>
                      <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                        ·
                      </span>
                    </>
                  ) : null}
                  <time dateTime={post.updatedAtIso} className="tabular-nums">
                    <LocalizedProfileUpdatedAt
                      updatedAtIso={post.updatedAtIso}
                      serverFallback={post.updatedAt}
                      isRecent={post.updatedAtIsRecent}
                    />
                  </time>
                  <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                    ·
                  </span>
                  <span>{post.readingTime}</span>
                  {post.tags.length > 0 ? (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {post.tags.map((tag) => (
                        <Link
                          key={tag}
                          href={`${post.tagBasePath}/${encodeURIComponent(tag)}`}
                          className="relative z-10 text-zinc-500 transition-colors hover:text-zinc-950 dark:hover:text-zinc-100"
                        >
                          #{tag}
                        </Link>
                      ))}
                    </span>
                  ) : null}
                </div>
              </div>
              <ArrowRight
                aria-hidden="true"
                className="mt-1 hidden h-4 w-4 flex-none -translate-x-1 text-zinc-400 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 sm:block"
              />
            </article>
          </li>
        ))}
      </ul>

      {hasMore ? (
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setVisibleCount((current) =>
                Math.min(posts.length, current + LOAD_MORE_STEP),
              )
            }
            className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-900/10 transition hover:text-zinc-950 hover:ring-zinc-900/20 active:scale-[0.98] dark:bg-zinc-900 dark:text-zinc-200 dark:ring-white/10 dark:hover:text-white"
          >
            Show {Math.min(LOAD_MORE_STEP, remainingCount)} more
          </button>
          <p className="text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
            Showing {visiblePosts.length} of {posts.length}
          </p>
        </div>
      ) : null}
    </>
  );
}
