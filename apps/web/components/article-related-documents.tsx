"use client";

import Link from "next/link";
import { useState } from "react";


type RelatedPost = {
  workspaceSlug: string;
  url: string;
  tagBasePath: string;
  slug: string;
  title: string;
  updatedAt: string;
  readingTime: string;
  tags: string[];
};

type ArticleRelatedDocumentsProps = {
  posts: RelatedPost[];
};

/**
 * How many rows to show by default and to reveal per "Load more"
 * click. Matches the product requirement: "If there are more than 7
 * articles with the same tag add a 'Load more' button."
 */
const INITIAL_VISIBLE = 7;
const BATCH_SIZE = 7;

/**
 * "Related documents" section rendered at the bottom of each article.
 * Lists other posts in the same workspace that share at least one tag
 * with the current post, sorted by most-recent-first. The list is
 * deliberately compact (no excerpt, smaller spacing than the workspace
 * profile page) so a reader can scan for the next doc without leaving
 * the current page.
 *
 * The server already trims to a bounded limit (default 25 in
 * `getRelatedPostsByTags`), so we slice locally on every "Load more"
 * click instead of making another round-trip. If a workspace has more
 * than the server-side limit sharing a tag, the extras simply never
 * surface here — that's fine for a discovery surface.
 */
export function ArticleRelatedDocuments({
  posts,
}: ArticleRelatedDocumentsProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  if (posts.length === 0) return null;

  const visiblePosts = posts.slice(0, visibleCount);
  const hasMore = visibleCount < posts.length;
  const remaining = posts.length - visibleCount;
  const nextBatchSize = Math.min(BATCH_SIZE, remaining);

  return (
    <section
      aria-label="Related documents"
      className="mt-16 border-t border-zinc-100 pt-10 dark:border-zinc-800"
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Related documents
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Other documents with the same tags.
        </p>
      </header>

      <ul className="-mx-3 flex flex-col">
        {visiblePosts.map((post) => (
          <li key={post.url}>
            {/* Same row as the workspace profile list: the title link's
                `::after` covers the row, tag links sit above it. */}
            <article className="group relative rounded-xl px-3 py-3 transition-colors duration-200 hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
              <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-zinc-900 dark:text-zinc-100">
                <Link
                  href={post.url}
                  className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary/50"
                >
                  {post.title}
                </Link>
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-zinc-500">
                <time dateTime={post.updatedAt}>{post.updatedAt}</time>
                <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                  ·
                </span>
                <span>{post.readingTime}</span>
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`${post.tagBasePath}/${encodeURIComponent(tag)}`}
                    className="relative z-10 text-zinc-500 transition-colors hover:text-zinc-950 dark:hover:text-zinc-100"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            </article>
          </li>
        ))}
      </ul>

      {hasMore ? (
        <div className="mt-8">
          <button
            type="button"
            onClick={() =>
              setVisibleCount((current) => current + BATCH_SIZE)
            }
            className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-6 text-xs font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-900/10 transition hover:text-primary hover:ring-zinc-900/20 dark:bg-zinc-900 dark:text-zinc-200 dark:shadow-black/20 dark:ring-white/10 dark:hover:text-violet-300 dark:hover:ring-white/20"
          >
            Load more
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              ({nextBatchSize} of {remaining})
            </span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
