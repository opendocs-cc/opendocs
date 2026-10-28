"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type CopyWorkspaceUrlProps = {
  /**
   * The URL-as-displayed string, e.g. `opendocs.cc/acme` — this is
   * what the user sees in the UI. We render it verbatim and never strip
   * the protocol, so whatever the server passes is what shows.
   */
  displayUrl: string;
  /**
   * Optional override for the value written to the clipboard. Falls back
   * to `window.location.origin + pathname`, which is almost always what
   * you want on the workspace profile (`opendocs.cc/{slug}`). Pass this
   * explicitly if the clipboard value should differ from the browser's
   * current URL (e.g. when rendering an absolute URL in dev).
   */
  copyValue?: string;
};

/**
 * Hoverable workspace URL that reveals a copy-to-clipboard button. The
 * button is hidden (opacity-0) until the user hovers the parent, at
 * which point it fades in. Click grabs the absolute URL from
 * `window.location` so it works regardless of the deployed hostname
 * (dev preview URLs, staging hosts, etc. all Just Work).
 */
export function CopyWorkspaceUrl({ displayUrl, copyValue }: CopyWorkspaceUrlProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const value =
      copyValue ??
      (typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname}`
        : displayUrl);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API can fail in non-secure contexts (http://) or when
      // the user denies permission. Swallowing here keeps the UI quiet —
      // a toast would be noisier than it's worth for a nice-to-have.
    }
  };

  return (
    <span className="group/url inline-flex items-center gap-1.5">
      <span className="font-mono text-sm text-zinc-500 dark:text-zinc-400">{displayUrl}</span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy workspace URL"}
        className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-md text-zinc-400 opacity-0 transition-all [@media(hover:none)]:opacity-100 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none group-hover/url:opacity-100 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2} />
        ) : (
          <Copy className="h-3.5 w-3.5" strokeWidth={2} />
        )}
      </button>
      {copied ? (
        <span
          role="status"
          aria-live="polite"
          className="text-xs font-medium text-emerald-600 dark:text-emerald-400"
        >
          Copied
        </span>
      ) : null}
    </span>
  );
}
