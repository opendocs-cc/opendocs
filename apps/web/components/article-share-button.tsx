"use client";

import { Check, Link2 } from "lucide-react";
import { useState } from "react";

/**
 * "Copy link" for the article. Copies the clean article URL (no version
 * or hash), using the native share sheet on touch devices when available.
 */
export function ArticleShareButton({ path, title }: { path: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    const url = `${window.location.origin}${path}`;
    const canShare =
      typeof navigator.share === "function" &&
      window.matchMedia("(hover: none)").matches;
    if (canShare) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Dismissed share sheet — fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (permissions / insecure origin); nothing useful to do.
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-3.5 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-900/10 transition hover:text-zinc-950 hover:ring-zinc-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.98] dark:bg-zinc-900 dark:text-zinc-200 dark:ring-white/10 dark:hover:text-white dark:hover:ring-white/20"
    >
      {copied ? (
        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      ) : (
        <Link2 className="h-4 w-4" aria-hidden="true" />
      )}
      <span aria-live="polite">{copied ? "Link copied" : "Copy link"}</span>
    </button>
  );
}
