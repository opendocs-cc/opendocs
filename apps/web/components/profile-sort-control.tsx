"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  ArrowDownAZ,
  ArrowDownZA,
  ArrowUpDown,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock,
  Loader2,
} from "lucide-react";

// Import from the leaf module (not the `@opendocs/shared/posts`
// barrel) so we don't transitively pull in `posts/service` → R2
// storage → `node:crypto` into the client bundle. Webpack can't
// resolve `node:crypto` in the browser environment and the build
// fails. This file only needs the sort enum + labels, both of which
// are pure data with zero runtime deps.
import {
  POST_SORT_LABELS,
  POST_SORT_VALUES,
  type PostSort,
} from "@opendocs/shared/posts/sort";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SORT_ICONS: Record<PostSort, typeof Clock> = {
  "recently-updated": Clock,
  "recently-added": CalendarPlus,
  "title-asc": ArrowDownAZ,
  "title-desc": ArrowDownZA,
};

/**
 * The "Recently updated ▾" sort menu above the articles list on the
 * workspace and project pages.
 *
 * The selection is owned by the URL (`?sort=...`) so it survives
 * refresh, can be deep-linked, and respects browser back/forward.
 * `useTransition` wraps the navigation so the menu stays responsive
 * while the server re-renders the list with the new order; the trigger
 * shows a spinner until it lands.
 *
 * `defaultSort` is what the page chose when the URL had no `?sort=`
 * param (workspace setting → global default fallback). We use it to
 * decide whether picking that value should *strip* the param from
 * the URL — keeping shared links short for the common case where
 * someone hasn't deviated from their workspace default.
 *
 * Built on the shared dropdown menu, styled like the Download and
 * theme menus. Items are `menuitemradio` (what Radix's RadioItem
 * renders) with a check on the current sort.
 */
type ProfileSortControlProps = {
  currentSort: PostSort;
  defaultSort: PostSort;
};

export function ProfileSortControl({
  currentSort,
  defaultSort,
}: ProfileSortControlProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: PostSort) {
    if (next === currentSort) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === defaultSort) {
      // Strip the param when the user picks the workspace default —
      // the URL is cleaner and a shared link doesn't carry a "sort"
      // qualifier that's semantically a no-op.
      params.delete("sort");
    } else {
      params.set("sort", next);
    }
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return (
    // Non-modal so opening it never locks or shifts the page.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Sort documents: ${POST_SORT_LABELS[currentSort]}`}
          aria-busy={isPending || undefined}
          className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-white pl-2.5 pr-2 text-xs font-medium text-zinc-700 shadow-sm shadow-zinc-900/5 ring-1 ring-zinc-900/10 transition hover:text-zinc-950 hover:ring-zinc-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.97] data-[state=open]:ring-zinc-900/20 dark:bg-zinc-900 dark:text-zinc-200 dark:shadow-black/20 dark:ring-white/10 dark:hover:text-white dark:hover:ring-white/20 dark:data-[state=open]:ring-white/20"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" aria-hidden="true" />
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
          )}
          <span>{POST_SORT_LABELS[currentSort]}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 overflow-hidden rounded-2xl border-zinc-200 bg-white p-1.5 shadow-2xl shadow-zinc-900/12 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/35"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">
          Sort by
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-1 bg-zinc-100 dark:bg-zinc-800" />
        {POST_SORT_VALUES.map((value) => {
          const Icon = SORT_ICONS[value];
          const selected = value === currentSort;
          return (
            <DropdownMenuItem
              key={value}
              role="menuitemradio"
              aria-checked={selected}
              onSelect={() => handleChange(value)}
              className="group flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-zinc-700 focus:bg-violet-50 focus:text-zinc-950 dark:text-zinc-200 dark:focus:bg-violet-400/10 dark:focus:text-white"
            >
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition ${
                  selected
                    ? "bg-white text-primary shadow-sm ring-1 ring-zinc-900/10 dark:bg-zinc-800 dark:text-violet-300 dark:ring-white/10"
                    : "bg-zinc-100 text-zinc-500 group-focus:bg-white group-focus:text-primary dark:bg-zinc-900 dark:text-zinc-400 dark:group-focus:bg-zinc-800 dark:group-focus:text-violet-300"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className={`min-w-0 flex-1 ${selected ? "font-medium text-zinc-950 dark:text-white" : ""}`}>
                {POST_SORT_LABELS[value]}
              </span>
              {selected ? (
                <Check className="h-4 w-4 shrink-0 text-primary dark:text-violet-300" aria-hidden="true" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
