"use client";

import Link from "next/link";
import { Check, ChevronDown, History } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ArticleVersionOption } from "@/lib/article-versions";

type ArticleVersionMenuProps = {
  versions: ArticleVersionOption[];
  /** The version on screen; null means the live version. */
  viewingVersionNumber: number | null;
};

/**
 * "Version 3 · Latest ▾" switcher at the top of an article. Each entry is
 * a plain link (`?v=N`, or the clean URL for the live version), so
 * versions are shareable and work without JavaScript once rendered.
 */
export function ArticleVersionMenu({
  versions,
  viewingVersionNumber,
}: ArticleVersionMenuProps) {
  const current = versions.find((version) => version.isCurrent);
  if (!current || versions.length === 0) return null;
  const shownNumber = viewingVersionNumber ?? current.versionNumber;
  const isOld = shownNumber !== current.versionNumber;

  return (
    // Non-modal: a modal menu locks page scroll, which shifted the page
    // sideways and misplaced the menu on scrolled pages.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Version ${shownNumber} of ${versions.length}. Show version history`}
          className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
            isOld
              ? "bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/25"
              : "bg-white text-zinc-700 ring-zinc-900/10 hover:text-zinc-950 hover:ring-zinc-900/20 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-white/10 dark:hover:ring-white/20"
          }`}
        >
          <History className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
          <span className="tabular-nums">v{shownNumber}</span>
          <span className="text-zinc-400 dark:text-zinc-500">·</span>
          <span>{isOld ? `of ${versions.length}` : "Latest"}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-zinc-200 bg-white p-1.5 shadow-xl shadow-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/40"
      >
        <DropdownMenuLabel className="px-2.5 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Version history · {versions.length}{" "}
          {versions.length === 1 ? "version" : "versions"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-1 bg-zinc-100 dark:bg-zinc-800" />
        <div className="max-h-[min(22rem,60vh)] overflow-y-auto">
          {versions.map((version) => {
            const isShown = version.versionNumber === shownNumber;
            const byline = [
              version.createdBy ? `@${version.createdBy}` : null,
              version.agent ? `via ${version.agent}` : null,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <DropdownMenuItem
                key={version.versionNumber}
                asChild
                className="cursor-pointer rounded-xl px-2.5 py-2 focus:bg-zinc-100 dark:focus:bg-zinc-900"
              >
                <Link
                  href={version.href}
                  scroll={false}
                  aria-current={isShown ? "page" : undefined}
                  className="flex items-start gap-3"
                >
                  <span
                    className={`mt-0.5 inline-flex h-6 min-w-[2rem] items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums ${
                      version.isCurrent
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    v{version.versionNumber}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100">
                      {version.createdAtLabel}
                      {version.isCurrent ? (
                        <span className="rounded bg-emerald-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                          Latest
                        </span>
                      ) : null}
                    </span>
                    {byline ? (
                      <span className="mt-0.5 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {byline}
                      </span>
                    ) : null}
                  </span>
                  {isShown ? (
                    <Check className="mt-1 h-4 w-4 flex-none text-zinc-900 dark:text-zinc-100" aria-hidden="true" />
                  ) : null}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
