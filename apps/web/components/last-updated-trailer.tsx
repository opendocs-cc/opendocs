"use client";

import { useEffect, useState } from "react";

type LastUpdatedTrailerProps = {
  /** Raw ISO-8601 timestamp of the last edit. */
  updatedAtIso: string;
  /**
   * Server-rendered fallback string. Always in UTC; used for SSR,
   * crawlers, JS-disabled clients, and the initial client paint before
   * hydration. Example: "April 19, 2026 at 3:45 PM UTC" for recent
   * posts, "April 19, 2026" for older ones.
   */
  serverFallback: string;
  /**
   * Whether the post is within the 2-week "recent" window. When true
   * the trailer reformats the timestamp on mount using the browser's
   * default locale — picking up both the 12h/24h preference (en-US →
   * 12h, fr-FR / de-DE → 24h) and the user's local timezone. When
   * false the `serverFallback` is already just a date, so there's
   * nothing locale-dependent to reformat.
   */
  isRecent: boolean;
};

/**
 * "Last updated" trailer at the bottom of the article. Locale-aware:
 * a US viewer sees "April 19, 2026 at 11:45 AM"; a French viewer sees
 * "19 avril 2026 à 15:45"; an older post in any locale sees just the
 * date.
 *
 * ## Why the server+client dance
 *
 * The browser's locale and timezone aren't available during
 * server-side rendering (the Accept-Language header is unreliable and
 * doesn't carry the timezone at all). So we render a predictable UTC
 * string on the server — keeps SSR hydration stable, works for
 * crawlers, works without JS — and swap to the localized version
 * inside `useEffect` once the component mounts. Because we drive the
 * swap through `useState`, the initial render matches the server
 * exactly; only the post-mount update uses the browser's locale, so
 * there's no hydration mismatch.
 *
 * We also avoid swapping for older posts where the server string is
 * just a date (no time, no AM/PM) — `Intl.DateTimeFormat` with
 * date-only options produces roughly the same output regardless of
 * locale, so reformatting would just risk unnecessary visual noise.
 */
export function LastUpdatedTrailer({
  updatedAtIso,
  serverFallback,
  isRecent,
}: LastUpdatedTrailerProps) {
  const [display, setDisplay] = useState(serverFallback);

  useEffect(() => {
    if (!isRecent) return;
    const parsed = new Date(updatedAtIso);
    if (Number.isNaN(parsed.getTime())) return;
    try {
      const formatter = new Intl.DateTimeFormat(undefined, {
        dateStyle: "long",
        timeStyle: "short",
      });
      setDisplay(formatter.format(parsed));
    } catch {
      // Very old browsers might choke on default-locale formatting.
      // Leave the server fallback in place rather than crash the
      // trailer — the UTC string is still a correct read of the time.
    }
  }, [updatedAtIso, isRecent]);

  return (
    <div className="mt-12 border-t border-zinc-100 pt-8 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      Last updated {display}.
    </div>
  );
}
