"use client";

import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";

import { ShortcutHint } from "@/components/shortcut-hint";
import { usePlatformIsMac } from "@/lib/use-platform";

/**
 * The header pill that opens the comments side-panel. Lives next to
 * the workspace-search trigger so a reader has the same "open this
 * thing" affordance pattern across both features.
 *
 * The trigger is rendered by `PublicSiteHeader`, but the actual panel
 * lives further down the tree inside `DocCommentingLayer`. We bridge
 * them with two window-level CustomEvents to avoid hoisting state up
 * through the SSR shell:
 *
 *   - `od-open-comments`  — trigger → layer ("show the panel")
 *   - `od-comments-count` — layer → trigger ("here's the active count")
 *
 * It's a tiny event bus, but it keeps both components leaf-mountable
 * and lets the static server shell stay free of client state.
 */
type CommentsTriggerProps = {
  /**
   * Whether the viewer can leave new comments. Doesn't gate rendering
   * on its own — readers should still be able to *read* threads — but
   * it does drive the empty-state copy ("Comment" vs "Read comments")
   * and the tooltip. The ⌘⌥M / Ctrl+Alt+M hint shows either way: it
   * starts a comment for commenters and opens the threads for readers
   * (`DocCommentingLayer` handles both).
   */
  canComment: boolean;
};

export function CommentsTrigger({ canComment }: CommentsTriggerProps) {
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const isMac = usePlatformIsMac();
  const shortcut = isMac ? "⌘⌥M" : "Ctrl+Alt+M";

  useEffect(() => {
    function onCount(event: Event) {
      const detail = (event as CustomEvent<{ active: number }>).detail;
      if (detail && typeof detail.active === "number") {
        setActiveCount(detail.active);
      }
    }
    window.addEventListener("od-comments-count", onCount);
    return () => window.removeEventListener("od-comments-count", onCount);
  }, []);

  // Until the layer has finished its first fetch we don't yet know
  // whether there are any threads to show. Render nothing in that
  // window so the header doesn't flash an empty pill that may then
  // disappear for a non-commenting viewer with zero threads.
  if (activeCount === null && !canComment) return null;

  // Even with zero threads, commenters get the pill so they have a
  // starting point. Readers only see it when there's something to
  // read — there's no point opening an empty panel they can't fill.
  if (!canComment && (activeCount ?? 0) === 0) return null;

  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("od-open-comments"));
      }}
      aria-label={
        canComment
          ? `Open comments (${activeCount ?? 0} active)`
          : `Read comments (${activeCount ?? 0})`
      }
      title={`Comments (${shortcut})`}
      aria-keyshortcuts="Meta+Alt+M Control+Alt+M"
      style={{ paddingLeft: "12px", paddingRight: "12px" }}
      className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-full bg-white px-2 text-zinc-500 shadow-sm shadow-zinc-900/5 ring-1 ring-zinc-900/10 transition-colors hover:text-zinc-800 hover:ring-zinc-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:bg-zinc-900 dark:text-zinc-400 dark:shadow-black/20 dark:ring-white/10 dark:hover:text-zinc-100"
    >
      <MessageSquare className="h-4 w-4" aria-hidden="true" />
      {activeCount && activeCount > 0 ? (
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary dark:bg-violet-400/15 dark:text-violet-300">
          {activeCount > 99 ? "99+" : activeCount}
        </span>
      ) : null}
      <ShortcutHint
        mac="⌘⌥M"
        other="Ctrl+Alt+M"
        className="hidden rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 md:pointer-fine:inline-block dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      />
    </button>
  );
}
