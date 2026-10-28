"use client";

import { Search } from "lucide-react";

import { ShortcutHint } from "@/components/shortcut-hint";
import { openWorkspaceSearch } from "@/components/workspace-search";

/**
 * Input-shaped button on the workspace profile that opens the workspace
 * search dialog (mounted once in the header). It reads as a search box so
 * people find search without knowing the ⌘K shortcut.
 */
export function ProfileSearchField({ placeholder }: { placeholder: string }) {
  return (
    <button
      type="button"
      onClick={openWorkspaceSearch}
      aria-label="Search documents"
      aria-keyshortcuts="Meta+K Control+K"
      className="group flex h-11 w-full items-center gap-3 rounded-xl bg-white px-3.5 text-left text-sm text-zinc-400 shadow-sm shadow-zinc-900/[0.04] ring-1 ring-zinc-900/10 transition hover:ring-zinc-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.995] sm:max-w-md dark:bg-zinc-900 dark:text-zinc-500 dark:ring-white/10 dark:hover:ring-white/20"
    >
      <Search className="h-4 w-4 flex-none text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300" aria-hidden="true" />
      <span className="flex-1 truncate">{placeholder}</span>
      <ShortcutHint
        mac="⌘K"
        other="Ctrl+K"
        className="hidden rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-zinc-500 sm:pointer-fine:inline-block dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
      />
    </button>
  );
}
