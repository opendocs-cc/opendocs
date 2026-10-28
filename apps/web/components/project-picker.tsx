"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, ChevronDown, FolderSearch, Layers, Search, X } from "lucide-react";

export type ProjectPickerEntry = {
  /** "all" for the workspace-wide entry, the project id otherwise. */
  key: string;
  label: string;
  href: string;
  count: number;
  isActive: boolean;
};

/** Opens the project picker from anywhere on the page. */
export function openProjectPicker() {
  window.dispatchEvent(new Event("od-open-projects"));
}

/**
 * "12 projects ▾" in the workspace hero. Reads as part of the stats line
 * but is a button that opens the picker.
 */
export function ProjectCountButton({ count }: { count: number }) {
  return (
    <button
      type="button"
      onClick={openProjectPicker}
      aria-haspopup="dialog"
      className="group -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100"
    >
      <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {count}
      </span>
      projects
      <ChevronDown
        className="h-3.5 w-3.5 text-zinc-400 transition-transform group-hover:translate-y-px group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300"
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * Trailing button in the sticky project tab bar, so the picker is
 * reachable once the hero has scrolled away and the tabs overflow.
 */
export function ProjectPickerTabButton() {
  return (
    <button
      type="button"
      onClick={openProjectPicker}
      aria-haspopup="dialog"
      aria-label="Find a project"
      title="Find a project"
      className="inline-flex h-8 flex-none items-center gap-1.5 rounded-full bg-white px-2 text-xs font-medium text-zinc-600 shadow-sm shadow-zinc-900/5 ring-1 ring-zinc-900/10 transition hover:text-zinc-900 hover:ring-zinc-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.97] sm:px-3 dark:bg-zinc-900 dark:text-zinc-300 dark:shadow-black/20 dark:ring-white/10 dark:hover:text-white dark:hover:ring-white/20"
    >
      <FolderSearch className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">Projects</span>
    </button>
  );
}

/**
 * Searchable project picker for workspaces with many projects. A
 * command-palette dialog on desktop (same look and keys as the ⌘K
 * workspace search) and a bottom sheet on phones. Mounted once per page;
 * the triggers above open it with `od-open-projects`, the same window
 * event pattern `WorkspaceSearch` uses.
 *
 * Radix Dialog handles the focus trap, Esc, outside clicks and scroll
 * locking. The list follows the combobox pattern: focus stays in the
 * input, ↑ ↓ move the highlight (wrapping), ↵ opens the highlighted
 * project. Rows are real links, so ⌘/Ctrl-click opens a new tab.
 */
export function ProjectPicker({ entries }: { entries: ProjectPickerEntry[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const router = useRouter();
  const viewport = useVisibleViewport(isOpen);

  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener("od-open-projects", handler);
    return () => window.removeEventListener("od-open-projects", handler);
  }, []);

  // Each open starts fresh, highlighting the project you're on.
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setHighlightIndex(Math.max(0, entries.findIndex((entry) => entry.isActive)));
  }, [isOpen, entries]);

  const results = useMemo(() => filterEntries(entries, query), [entries, query]);
  const safeHighlightIndex =
    results.length === 0 ? 0 : Math.min(highlightIndex, results.length - 1);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-picker-index="${safeHighlightIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [safeHighlightIndex, isOpen]);

  const choose = useCallback(
    (href: string) => {
      setIsOpen(false);
      router.push(href);
    },
    [router],
  );

  const projectCount = entries.filter((entry) => entry.key !== "all").length;

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-zinc-900/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 dark:bg-black/65" />
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={undefined}
          // Focus the input on desktop. On touch screens, focusing it
          // would raise the keyboard over half the sheet before the
          // reader has seen the list, so focus the sheet instead.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (window.matchMedia("(pointer: fine)").matches) {
              inputRef.current?.focus();
            } else {
              contentRef.current?.focus();
            }
          }}
          style={
            {
              "--kb-inset": `${viewport.keyboardInset}px`,
              "--vv-height": viewport.height ? `${viewport.height}px` : "100dvh",
            } as CSSProperties
          }
          className="fixed inset-x-0 bottom-[var(--kb-inset)] z-[90] flex max-h-[min(85dvh,calc(var(--vv-height)_-_2rem))] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-zinc-900/5 outline-none duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom dark:bg-zinc-950 dark:shadow-black/50 dark:ring-white/10 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[18vh] sm:max-h-[min(70vh,36rem)] sm:w-[calc(100%_-_2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:rounded-2xl sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:fade-in-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=closed]:fade-out-0 sm:data-[state=closed]:zoom-out-95"
        >
          {/* Grab handle: the sheet's affordance on phones. Decorative. */}
          <div aria-hidden="true" className="flex justify-center pt-2.5 sm:hidden">
            <span className="h-1 w-9 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          </div>

          <DialogPrimitive.Title className="px-4 pb-1 pt-2 text-sm font-semibold text-zinc-900 sm:sr-only dark:text-zinc-100">
            Projects
          </DialogPrimitive.Title>

          <div className="flex items-center gap-3 border-b border-zinc-100 px-4 dark:border-zinc-800">
            <Search className="h-4 w-4 flex-none text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="project-picker-results"
              aria-autocomplete="list"
              aria-label="Find a project"
              aria-activedescendant={
                results.length > 0 ? `project-picker-option-${safeHighlightIndex}` : undefined
              }
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlightIndex(0);
              }}
              onKeyDown={(event) => {
                if (results.length === 0) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlightIndex((safeHighlightIndex + 1) % results.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlightIndex(
                    (safeHighlightIndex - 1 + results.length) % results.length,
                  );
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  choose(results[safeHighlightIndex].entry.href);
                }
              }}
              placeholder="Find a project…"
              enterKeyHint="go"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="h-12 flex-1 bg-transparent text-base text-zinc-800 placeholder:text-zinc-400 focus:outline-none sm:text-sm dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <DialogPrimitive.Close
              aria-label="Close projects"
              title="Close (Esc)"
              className="rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {results.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                No projects match “{query.trim()}”.
              </p>
            ) : (
              <ul
                ref={listRef}
                id="project-picker-results"
                role="listbox"
                aria-label="Projects"
                className="p-1.5"
              >
                {results.map(({ entry, ranges }, idx) => {
                  const isHighlighted = idx === safeHighlightIndex;
                  return (
                    <li
                      key={entry.key}
                      id={`project-picker-option-${idx}`}
                      role="option"
                      aria-selected={isHighlighted}
                      data-picker-index={idx}
                    >
                      <Link
                        href={entry.href}
                        tabIndex={-1}
                        aria-current={entry.isActive ? "page" : undefined}
                        onClick={(event) => {
                          // Modified clicks keep their new-tab behaviour.
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
                          choose(entry.href);
                        }}
                        // pointermove, not mouseenter: rows sliding under a
                        // still cursor while arrowing through the list must
                        // not steal the highlight.
                        onPointerMove={() => {
                          if (!isHighlighted) setHighlightIndex(idx);
                        }}
                        className={`flex min-h-11 items-center gap-3 rounded-xl px-2.5 py-2 transition-colors ${
                          isHighlighted ? "bg-zinc-100 dark:bg-zinc-800/70" : ""
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg text-xs font-semibold ring-1 transition-colors ${
                            entry.isActive
                              ? "bg-zinc-900 text-white ring-zinc-900 dark:bg-white dark:text-zinc-900 dark:ring-white"
                              : "bg-zinc-50 text-zinc-500 ring-zinc-900/[0.06] dark:bg-zinc-900 dark:text-zinc-400 dark:ring-white/10"
                          }`}
                        >
                          {entry.key === "all" ? (
                            <Layers className="h-4 w-4" />
                          ) : (
                            monogram(entry.label)
                          )}
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate text-sm ${
                            entry.isActive
                              ? "font-semibold text-zinc-950 dark:text-white"
                              : "font-medium text-zinc-700 dark:text-zinc-200"
                          }`}
                        >
                          {highlightRanges(entry.label, ranges)}
                        </span>
                        <span className="flex-none text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
                          {entry.count} {entry.count === 1 ? "doc" : "docs"}
                        </span>
                        <span className="flex w-4 flex-none justify-center">
                          {entry.isActive ? (
                            <Check
                              className="h-4 w-4 text-primary dark:text-violet-300"
                              aria-label="Current"
                            />
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Same legend as the search dialog. Touch screens get none:
              there are no keys to learn there. */}
          <div className="flex items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/50 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            <div className="hidden items-center gap-3 pointer-fine:flex">
              <span className="inline-flex items-center gap-1">
                <KeyCap>↑</KeyCap>
                <KeyCap>↓</KeyCap>
                navigate
              </span>
              <span className="inline-flex items-center gap-1">
                <KeyCap>↵</KeyCap>
                open
              </span>
              <span className="inline-flex items-center gap-1">
                <KeyCap>esc</KeyCap>
                close
              </span>
            </div>
            <span className="ml-auto tabular-nums">
              {query.trim()
                ? `${results.filter((r) => r.entry.key !== "all").length} of ${projectCount}`
                : projectCount}{" "}
              {projectCount === 1 ? "project" : "projects"}
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function KeyCap({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-[16px] items-center justify-center rounded border border-zinc-200 bg-white px-1 text-[10px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
      {children}
    </kbd>
  );
}

/**
 * The on-screen keyboard's height and the visible height while the sheet
 * is open, so the sheet sits on top of the keyboard instead of behind
 * it. Mobile browsers don't resize the layout viewport for the keyboard;
 * only `visualViewport` shrinks.
 */
function useVisibleViewport(active: boolean) {
  const [state, setState] = useState({ keyboardInset: 0, height: 0 });
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) {
      setState({ keyboardInset: 0, height: 0 });
      return;
    }
    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      setState({
        keyboardInset: covered > 80 ? Math.round(covered) : 0,
        height: Math.round(viewport.height),
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [active]);
  return state;
}

// ---------------------------------------------------------------------------
// Matching. Case- and accent-insensitive ("sida" finds "Vefsíða"), every
// query word must match, and names that start with the query rank above
// names with a word starting with it, which rank above plain substring
// matches. Ties keep the workspace's own project order.
// ---------------------------------------------------------------------------

type MatchRange = [start: number, end: number];

type PickerResult = { entry: ProjectPickerEntry; ranges: MatchRange[] };

function filterEntries(entries: ProjectPickerEntry[], query: string): PickerResult[] {
  const tokens = fold(query).text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return entries.map((entry) => ({ entry, ranges: [] }));

  const scored: Array<PickerResult & { score: number; order: number }> = [];
  entries.forEach((entry, order) => {
    const { text, map } = fold(entry.label);
    let score = 0;
    const ranges: MatchRange[] = [];
    for (const token of tokens) {
      const at = text.indexOf(token);
      if (at === -1) return;
      const wordStart = at === 0 || /[^\p{L}\p{N}]/u.test(text[at - 1]);
      score += at === 0 ? 3 : wordStart ? 2 : 1;
      ranges.push([map[at], map[at + token.length] ?? entry.label.length]);
    }
    scored.push({ entry, ranges: mergeRanges(ranges), score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map(({ entry, ranges }) => ({ entry, ranges }));
}

/** Letters NFD can't split into a base letter and an accent. */
const TRANSLITERATE: Record<string, string> = {
  ð: "d",
  đ: "d",
  þ: "th",
  æ: "ae",
  ø: "o",
  œ: "oe",
  ß: "ss",
  ł: "l",
};

/**
 * Lowercases and strips accents, keeping a map from each folded
 * character back to its index in the original string so matches can be
 * highlighted in the original text.
 */
function fold(input: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  let offset = 0;
  for (const char of input) {
    const lower = char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const folded = TRANSLITERATE[lower] ?? lower;
    text += folded;
    // One entry per UTF-16 unit, so indexes into `text` index `map`.
    for (let i = 0; i < folded.length; i++) map.push(offset);
    offset += char.length;
  }
  return { text, map };
}

function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: MatchRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

function highlightRanges(text: string, ranges: MatchRange[]): ReactNode {
  if (ranges.length === 0) return text;
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={i}
        // No padding (unlike the search dialog's whole-word marks): a
        // match can be a few letters inside a word.
        className="rounded-[3px] bg-yellow-100 text-inherit dark:bg-yellow-400/25"
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function monogram(name: string) {
  const letter = Array.from(name.trim())[0] ?? "?";
  return letter.toUpperCase();
}
