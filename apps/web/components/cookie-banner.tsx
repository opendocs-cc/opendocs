"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  OPEN_COOKIE_SETTINGS_EVENT,
  adsEnabled,
  readConsent,
  shouldAskForConsent,
  writeConsent,
} from "@/lib/ad-tracking/consent";
import { isOpenDocsBrowserHost } from "@/lib/browser-host";

/**
 * A small corner card that asks once, in consent regions only (see
 * lib/ad-tracking/consent.ts), and never blocks the page. "Cookie settings"
 * in the footer reopens it anywhere.
 */
export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [fromSettings, setFromSettings] = useState(false);

  useEffect(() => {
    // No banner on custom domains: no pixels load there to ask about.
    if (!adsEnabled || !isOpenDocsBrowserHost()) return;
    if (shouldAskForConsent()) setOpen(true);
    const reopen = () => {
      setFromSettings(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  if (!open) return null;

  const choose = (value: "granted" | "denied") => {
    writeConsent(value);
    setOpen(false);
  };
  const current = fromSettings ? readConsent() : null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie preferences"
      className="fixed bottom-4 left-4 right-4 z-[60] max-w-[360px] rounded-2xl bg-white p-4 text-[13px] leading-[1.5] text-zinc-600 shadow-[0_12px_40px_-12px_rgba(24,24,27,0.35)] ring-1 ring-zinc-900/10 sm:left-auto sm:w-[360px]"
    >
      <p>
        We use cookies to improve your experience.{" "}
        <Link href="/privacy#cookies" className="font-medium text-zinc-900 underline underline-offset-2">
          Privacy
        </Link>
      </p>
      {current ? (
        <p className="mt-1 text-zinc-500">
          Currently: {current === "denied" ? "declined" : "allowed"}.
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => choose("denied")}
          className="rounded-lg bg-zinc-100 px-3 py-2 font-medium text-zinc-900 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => choose("granted")}
          className="rounded-lg bg-zinc-900 px-3 py-2 font-medium text-white transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
        >
          Accept
        </button>
      </div>
    </div>
  );
}

/** Footer link that reopens the banner. Renders nothing while ads are off. */
export function CookieSettingsButton({ className }: { className?: string }) {
  if (!adsEnabled) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT))}
    >
      Cookie settings
    </button>
  );
}
