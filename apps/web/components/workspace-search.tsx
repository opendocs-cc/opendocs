"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CornerDownRight, Search, X } from "lucide-react";

import { ShortcutHint } from "@/components/shortcut-hint";
import { getTagColorFor } from "@/lib/tag-colors";

type SearchItem = {
  slug: string;
  url: string;
  title: string;
  summary: string;
  tags: string[];
  updatedAt: string;
  workspaceSlug: string;
  /** Project name; null for the default project. Absent on old payloads. */
  projectName?: string | null;
  headings?: Array<{ id: string; text: string }>;
  body?: string;
};

type SearchIndex = {
  items: SearchItem[];
  tagColorIndex: Record<string, number>;
};

type ScoredResult = {
  item: SearchItem;
  score: number;
  /** Text to show under the title, and where the first match starts in it. */
  snippetSource: string;
  snippetMatchStart: number;
  /** Up to two headings that matched, for "jump to section" links. */
  headingMatches: Array<{ id: string; text: string }>;
};

/** How many recent documents the dialog lists before you type. */
const RECENT_LIMIT = 6;

/** Opens the workspace search dialog from anywhere on the page. */
export function openWorkspaceSearch() {
  window.dispatchEvent(new Event("od-open-search"));
}

type WorkspaceSearchProps = {
  /** Slug of the workspace the dialog should search. */
  workspaceSlug: string;
  /**
   * Accessible label for the trigger button. Rendered inside the
   * header — "Search documents" keeps it clear without needing a
   * visible text label.
   */
  triggerLabel?: string;
};

/**
 * Shared ⌘K-style workspace search. Rendered on both the workspace
 * profile (`/workspace-id`) and the article page (`/workspace-id/
 * document-slug`) so a reader has the same search affordance
 * everywhere — one mental model, one keyboard shortcut, one UI.
 *
 * ## How it fetches
 *
 * The compact index (~80 KB gzipped for 1000 docs) is *not* shipped
 * with the page. We lazy-fetch it via `/api/workspace/:slug/search-
 * index` the first time the dialog opens, cache the result in a ref
 * for the rest of the tab's lifetime, and search it synchronously on
 * every keystroke. No debounce — at 1000 entries the matcher runs in
 * single-digit milliseconds.
 *
 * Subsequent opens reuse the cached index. If the user publishes a
 * new doc in another tab the cache is slightly stale; a full page
 * reload refreshes it. We deliberately accept this — a staleness
 * window of minutes is fine for a search affordance, and it
 * eliminates a class of "why is the index fetching mid-keystroke"
 * jitter.
 *
 * ## Keyboard
 *
 * - `⌘K` / `Ctrl-K` from anywhere opens the dialog.
 * - `/` opens when no input is focused (standard docs-platform idiom).
 * - `Esc` closes.
 * - `↑ ↓` navigate the result list (wraps).
 * - `↵` navigates to the highlighted result.
 *
 * ## Scoring
 *
 * Query tokens are normalized lowercase + trimmed. Each token is
 * matched against title / tags / summary with weights 100 / 60 / 20.
 * A title prefix match adds +50, a first-position token match adds
 * +30 (the user's most-recent word is the strongest signal). Zero-
 * score items are dropped. Top 10 shown, scored descending.
 *
 * Scoring is intentionally simple — you can read the whole matcher in
 * one screen. For 1000 docs it's more than accurate enough; if demand
 * grows we'd move to server-side Postgres FTS with BM25 ranking, at
 * which point this file's matcher gets replaced rather than extended.
 */
export function WorkspaceSearch({
  workspaceSlug,
  triggerLabel = "Search documents",
}: WorkspaceSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  // Cache the fetched index for the tab lifetime. Held in a ref so a
  // background refetch wouldn't re-render mid-typing.
  const indexRef = useRef<SearchIndex | null>(null);
  // Re-render token — bumped when the index arrives so the result
  // list recomputes even though we stored the data in a ref.
  const [indexVersion, setIndexVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const router = useRouter();

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  // ---- Global keyboard shortcuts: ⌘K / Ctrl-K always, `/` when not typing.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isModKey =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isModKey) {
        event.preventDefault();
        setIsOpen((prev) => !prev);
        return;
      }
      // `/` only opens when the user isn't already typing into
      // something. Checking the active element here instead of
      // stopPropagation on every form control is simpler and catches
      // contenteditable too.
      if (event.key === "/" && !isOpen) {
        const target = document.activeElement;
        const isTyping =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable);
        if (!isTyping) {
          event.preventDefault();
          setIsOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  // ---- External open requests via window event. The article-page
  // header renders a second, slimmer trigger button inside its scroll-
  // reveal floating bar; that stub doesn't mount its own
  // `WorkspaceSearch` (we used to, and it caused a duplicate `⌘K`
  // listener + two stacked dialogs). Instead it dispatches
  // `od-open-search`, which this canonical instance listens for.
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener("od-open-search", handler);
    return () => window.removeEventListener("od-open-search", handler);
  }, []);

  // ---- On-open side effects: lock body scroll, focus input, fetch index.
  useEffect(() => {
    if (!isOpen) return;

    // Lock page scroll while open. Hiding the scrollbar would widen the
    // page and nudge everything sideways, so pad by its width instead.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    // Only fetch if we haven't already — the cache lives for the tab.
    if (!indexRef.current && status !== "loading") {
      setStatus("loading");
      fetch(
        `/api/workspace/${encodeURIComponent(workspaceSlug)}/search-index`,
        { credentials: "include" },
      )
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const data = (await response.json()) as SearchIndex;
          indexRef.current = data;
          setStatus("idle");
          setIndexVersion((v) => v + 1);
        })
        .catch(() => {
          setStatus("error");
        });
    }

    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [isOpen, status, workspaceSlug]);

  // Focus the input on open and select any previous query, so typing
  // replaces it instead of appending. Runs once per open (not when the
  // index finishes loading, which would re-select mid-typing). The rAF
  // waits for the input to mount.
  useEffect(() => {
    if (!isOpen) return;
    const raf = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

  // ---- Close on Esc + keyboard nav over the result list.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightIndex((prev) => prev + 1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      // Enter handled in the input's onKeyDown — it has the current
      // results in closure, which is cleaner than re-reading state
      // from here.
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  // ---- Match pipeline: tokenize → score → sort → top N.
  const results = useMemo<ScoredResult[]>(() => {
    const index = indexRef.current;
    if (!index || !query.trim()) return [];
    const tokens = normalizeQuery(query);
    if (tokens.length === 0) return [];

    const scored: ScoredResult[] = [];
    for (const item of index.items) {
      const score = scoreItem(item, tokens);
      if (score.total <= 0) continue;
      scored.push({
        item,
        score: score.total,
        snippetSource: score.snippetSource,
        snippetMatchStart: score.snippetMatchStart,
        headingMatches: score.headingMatches,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 10);
    // indexVersion is the re-render token — keep it in the deps so
    // the memo recomputes when the fetched payload lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, indexVersion]);

  // Reset highlight to the top every time the query changes.
  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  // Clamp highlight to the results length whenever results resize.
  // With an empty query the dialog lists the most recently updated
  // documents (the index is already sorted that way), so it is useful
  // for browsing too. Keyboard navigation runs over whichever list shows.
  const recentItems = useMemo(
    () => (indexRef.current?.items ?? []).slice(0, RECENT_LIMIT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [indexVersion],
  );
  const showingRecent = query.trim().length === 0;
  const navigableUrls = showingRecent
    ? recentItems.map((item) => item.url)
    : results.map((result) => result.item.url);
  const navigableCount = navigableUrls.length;
  const safeHighlightIndex =
    navigableCount === 0 ? 0 : Math.min(highlightIndex, navigableCount - 1);

  // Scroll the highlighted row into view when it moves off-screen.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(
      `[data-search-index="${safeHighlightIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [safeHighlightIndex]);

  const tokens = useMemo(() => normalizeQuery(query), [query]);

  const tagColorIndex = indexRef.current?.tagColorIndex ?? {};

  return (
    <>
      {/* Trigger — icon-only pill, matches the existing header style
          on both pages. The `⌘K` badge is hidden on small screens to
          keep the mobile header tight, and on touch screens. */}
      <button
        type="button"
        onClick={open}
        aria-label={triggerLabel}
        style={{ paddingLeft: "12px", paddingRight: "15px" }}
        aria-keyshortcuts="Meta+K Control+K"
        className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-full bg-white px-2 text-zinc-500 shadow-sm shadow-zinc-900/5 ring-1 ring-zinc-900/10 transition-colors hover:text-zinc-800 hover:ring-zinc-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:bg-zinc-900 dark:text-zinc-400 dark:shadow-black/20 dark:ring-white/10 dark:hover:text-zinc-100"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        <ShortcutHint
          mac="⌘K"
          other="Ctrl+K"
          className="hidden rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 md:pointer-fine:inline-block dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        />
      </button>

      {/* Portalled to <body>: the dialog is position:fixed, and the
          sticky header it's mounted in gets a backdrop-filter once the
          page scrolls, which would make the header its containing block
          (the backdrop then covered only the header and the page behind
          could still be scrolled). */}
      {isOpen && typeof document !== "undefined" ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search documents"
          // `pointer-events-auto` is load-bearing: the trigger lives
          // inside a `pointer-events-none` header (so the hero CTA
          // underneath the nav stays clickable), and the modal is
          // rendered inside that same component tree. Without this we
          // inherit `none`, every click passes straight through, the
          // close X does nothing, the backdrop doesn't capture, and
          // text selection lands on the page underneath — exactly the
          // "close button not working / can interact with content
          // behind the overlay" bug reported.
          className="pointer-events-auto fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh] sm:pt-[18vh]"
        >
          {/* Backdrop — click anywhere outside the panel to close.
              Sits under the panel in the stacking order so panel
              clicks don't bleed through to it. */}
          <div
            aria-hidden="true"
            onClick={close}
            className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm dark:bg-black/65"
          />

          <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-900/5 dark:bg-zinc-950 dark:shadow-black/50 dark:ring-white/10">
            {/* Input row */}
            <div className="flex items-center gap-3 border-b border-zinc-100 px-4 dark:border-zinc-800">
              <Search
                className="h-4 w-4 flex-none text-zinc-400 dark:text-zinc-500"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const url = navigableUrls[safeHighlightIndex];
                    if (!url) return;
                    close();
                    router.push(url);
                  }
                }}
                placeholder="Search documents…"
                autoFocus
                className="h-12 flex-1 bg-transparent text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                aria-controls="workspace-search-results"
                aria-activedescendant={
                  navigableCount > 0
                    ? `workspace-search-result-${safeHighlightIndex}`
                    : undefined
                }
              />
              {/* Single close X. We used to render a second "clear
                  query" X next to it, but two Xs side-by-side was
                  confusing and people read the first one as the close
                  button. Backspace clears the query just fine. */}
              <button
                type="button"
                onClick={close}
                aria-label="Close search"
                title="Close (Esc)"
                className="rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Results region */}
            <div className="max-h-[50vh] overflow-y-auto overscroll-contain">
              {status !== "error" && !indexRef.current ? (
                <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  Loading documents…
                </p>
              ) : status === "error" ? (
                <p className="px-4 py-8 text-center text-sm text-red-600 dark:text-red-400">
                  Couldn't load the search index. Try closing and reopening the
                  dialog.
                </p>
              ) : showingRecent ? (
                recentItems.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    No documents in this workspace yet.
                  </p>
                ) : (
                  <div className="py-2">
                    <p className="px-4 pb-1 pt-1 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                      Recently updated
                    </p>
                    <ul
                      ref={listRef}
                      id="workspace-search-results"
                      role="listbox"
                    >
                      {recentItems.map((item, idx) => {
                        const isActive = idx === safeHighlightIndex;
                        return (
                          <li
                            key={item.url}
                            id={`workspace-search-result-${idx}`}
                            role="option"
                            aria-selected={isActive}
                            data-search-index={idx}
                          >
                            <Link
                              href={item.url}
                              onClick={(event) => {
                                if (
                                  event.metaKey ||
                                  event.ctrlKey ||
                                  event.shiftKey ||
                                  event.altKey ||
                                  event.button !== 0
                                ) {
                                  return;
                                }
                                event.preventDefault();
                                close();
                                router.push(item.url);
                              }}
                              onMouseEnter={() => setHighlightIndex(idx)}
                              className={`flex items-baseline justify-between gap-3 px-4 py-2.5 transition-colors ${
                                isActive
                                  ? "bg-zinc-50 dark:bg-zinc-900"
                                  : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                                {item.title}
                              </span>
                              <span className="flex-none text-xs text-zinc-400 dark:text-zinc-500">
                                {item.projectName ? `${item.projectName} · ` : ""}
                                {item.updatedAt}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )
              ) : results.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No documents match "{query.trim()}". Try different keywords.
                </p>
              ) : (
                <ul
                  ref={listRef}
                  id="workspace-search-results"
                  role="listbox"
                  className="py-2"
                >
                  {results.map((result, idx) => {
                    const isActive = idx === safeHighlightIndex;
                    return (
                      <li
                        key={result.item.url}
                        id={`workspace-search-result-${idx}`}
                        role="option"
                        aria-selected={isActive}
                        data-search-index={idx}
                      >
                        <Link
                          href={result.item.url}
                          onClick={(event) => {
                            // Plain left-click → close the dialog and route
                            // explicitly. Modifier-clicks (cmd/ctrl/middle)
                            // are left alone so they keep their default
                            // "open in new tab" behaviour.
                            if (
                              event.metaKey ||
                              event.ctrlKey ||
                              event.shiftKey ||
                              event.altKey ||
                              event.button !== 0
                            ) {
                              return;
                            }
                            event.preventDefault();
                            close();
                            router.push(result.item.url);
                          }}
                          onMouseEnter={() => setHighlightIndex(idx)}
                          className={`block px-4 py-3 transition-colors ${
                            isActive
                              ? "bg-zinc-50 dark:bg-zinc-900"
                              : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {highlightText(result.item.title, tokens)}
                            </h3>
                            <span className="flex-none text-xs text-zinc-400 dark:text-zinc-500">
                              {result.item.projectName
                                ? `${result.item.projectName} · `
                                : ""}
                              {result.item.updatedAt}
                            </span>
                          </div>
                          {result.snippetSource ? (
                            <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                              {highlightText(
                                snippetAround(
                                  result.snippetSource,
                                  result.snippetMatchStart,
                                ),
                                tokens,
                              )}
                            </p>
                          ) : null}
                          {result.headingMatches.length > 0 ? (
                            <div className="mt-1.5 flex flex-col gap-0.5">
                              {result.headingMatches.map((heading) => (
                                <span
                                  key={heading.id}
                                  role="link"
                                  tabIndex={-1}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    close();
                                    router.push(`${result.item.url}#${heading.id}`);
                                  }}
                                  className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                                >
                                  <CornerDownRight
                                    className="h-3 w-3 flex-none text-zinc-400"
                                    aria-hidden="true"
                                  />
                                  <span className="truncate">
                                    {highlightText(heading.text, tokens)}
                                  </span>
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {result.item.tags.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {result.item.tags.slice(0, 5).map((tag) => {
                                const color = getTagColorFor(
                                  tag,
                                  tagColorIndex,
                                );
                                return (
                                  <span
                                    key={tag}
                                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${color.base}`}
                                  >
                                    {tag}
                                  </span>
                                );
                              })}
                            </div>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Keyboard legend. Tucked at the bottom so users learn the
                shortcuts without the dialog looking busy. */}
            <div className="flex items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/50 px-4 py-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              <div className="hidden items-center gap-3 pointer-fine:flex">
                <span className="inline-flex items-center gap-1">
                  <KeyCap>↑</KeyCap>
                  <KeyCap>↓</KeyCap>
                  navigate
                </span>
                <span className="inline-flex items-center gap-1">
                  <KeyCap>↵</KeyCap>
                  select
                </span>
                <span className="inline-flex items-center gap-1">
                  <KeyCap>esc</KeyCap>
                  close
                </span>
              </div>
              {indexRef.current ? (
                <span className="ml-auto">
                  {indexRef.current.items.length}{" "}
                  {indexRef.current.items.length === 1 ? "doc" : "docs"}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      , document.body) : null}
    </>
  );
}

function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-[16px] items-center justify-center rounded border border-zinc-200 bg-white px-1 text-[10px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Scoring / matching primitives. Kept outside the component so the React
// re-render path doesn't re-allocate them, and so they're trivial to unit-test
// or extract later if we need to share scoring with a server endpoint.
// ---------------------------------------------------------------------------

/**
 * Split and normalize user query into lowercase tokens. Empty tokens
 * dropped. Keeps this trivial — if we ever want phrase matching or
 * operators we'd upgrade here first.
 */
function normalizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Score a single item against the tokenized query. Returns the total
 * score plus the index of the first token match in `summary` (or -1)
 * so the renderer can show a snippet centered on the match instead of
 * always the opening clause.
 */
function scoreItem(
  item: SearchItem,
  tokens: string[],
): {
  total: number;
  snippetSource: string;
  snippetMatchStart: number;
  headingMatches: Array<{ id: string; text: string }>;
} {
  const title = item.title.toLowerCase();
  const summary = item.summary.toLowerCase();
  const body = (item.body ?? "").toLowerCase();
  const tagSet = new Set(item.tags.map((t) => t.toLowerCase()));
  const headings = item.headings ?? [];

  let total = 0;
  let summaryMatchStart = -1;
  let bodyMatchStart = -1;
  const headingHits = new Map<string, number>();

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Title — heaviest weight. Prefix match (token at position 0) is
    // a very strong signal: the user almost always starts typing the
    // doc they remember.
    if (title.includes(token)) {
      total += 100;
      if (title.startsWith(token)) total += 50;
    }

    // Tags — strong signal and usually short, so an exact-word match
    // is what we want. Using a Set is fine; `.has` is O(1) average.
    if (tagSet.has(token)) {
      total += 60;
    } else {
      // Partial tag match still contributes something (e.g. "auth"
      // matching tag "authentication").
      for (const tag of tagSet) {
        if (tag.includes(token)) {
          total += 30;
          break;
        }
      }
    }

    // Summary — lighter weight, but also surfaces body-ish matches
    // since the summary is the first paragraph of prose.
    const summaryIndex = summary.indexOf(token);
    if (summaryIndex >= 0) {
      total += 20;
      if (summaryMatchStart === -1) summaryMatchStart = summaryIndex;
    }

    // Section headings — a strong signal, and they let the result link
    // straight to the matching section.
    let headingMatched = false;
    for (const heading of headings) {
      if (heading.text.toLowerCase().includes(token)) {
        headingHits.set(heading.id, (headingHits.get(heading.id) ?? 0) + 1);
        headingMatched = true;
      }
    }
    if (headingMatched) total += 40;

    // Body text (the first SEARCH_BODY_CHARS of the document).
    const bodyIndex = body.indexOf(token);
    if (bodyIndex >= 0) {
      total += 10;
      if (bodyMatchStart === -1) bodyMatchStart = bodyIndex;
    }

    // Position boost: the first (leftmost) query token is the
    // strongest signal of what the user is actually looking for.
    if (i === 0 && total > 0) total += 30;
  }

  // Headings matching the most query words first, document order second.
  const headingMatches = headings
    .filter((heading) => headingHits.has(heading.id))
    .sort((a, b) => (headingHits.get(b.id) ?? 0) - (headingHits.get(a.id) ?? 0))
    .slice(0, 2);

  // Prefer a summary snippet; fall back to the body when only the body
  // matched, so the reader sees why the document came up.
  const useBody = summaryMatchStart === -1 && bodyMatchStart >= 0;
  return {
    total,
    snippetSource: useBody ? (item.body ?? "") : item.summary,
    snippetMatchStart: useBody ? bodyMatchStart : summaryMatchStart,
    headingMatches,
  };
}

/**
 * Produce a snippet windowed around `matchIndex` in the source text.
 * Keeps output in the 110-140 char range, prefers cutting on a word
 * boundary, and appends a leading ellipsis when the snippet starts
 * past the beginning. If `matchIndex` is -1 (no summary match) we
 * return the leading slice — the match was in title or tags, and the
 * opening of the summary is the most useful context to show.
 */
function snippetAround(text: string, matchIndex: number): string {
  if (text.length <= 140) return text;
  if (matchIndex < 0) return truncateAtWord(text, 140);
  const start = Math.max(0, matchIndex - 40);
  const end = Math.min(text.length, start + 140);
  const slice = text.slice(start, end);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${slice.trim()}${suffix}`;
}

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const hard = text.slice(0, max);
  const lastSpace = hard.lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? hard.slice(0, lastSpace) : hard;
  return `${cut}…`;
}

/**
 * Wrap every occurrence of `tokens` in the supplied text with a
 * `<mark>`. Case-insensitive, regex-escaped, preserves the original
 * casing of the source. Returns a React fragment so callers render
 * directly: `<h3>{highlightText(title, tokens)}</h3>`.
 */
function highlightText(text: string, tokens: string[]): React.ReactNode {
  if (tokens.length === 0 || !text) return text;
  const escaped = tokens
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean);
  if (escaped.length === 0) return text;
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);
  return parts.map((part, i) => {
    const isMatch = tokens.some((t) => part.toLowerCase() === t);
    if (!isMatch) return <span key={i}>{part}</span>;
    return (
      <mark key={i} className="rounded bg-yellow-100 px-0.5 text-inherit dark:bg-yellow-400/25">
        {part}
      </mark>
    );
  });
}
