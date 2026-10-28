"use client";

import { useEffect, useState } from "react";

/**
 * Reports whether the current browser is running on macOS / iOS so
 * UI labels can swap between "⌘K" and "Ctrl+K" (or "⌘⌥M" vs
 * "Ctrl+Alt+M") for keyboard hints.
 *
 * `null` until mounted: the detection runs in `useEffect` so it never
 * touches `navigator` during SSR. Hints can stay invisible until then
 * instead of flashing the wrong label (see `usePlatformIsMac` for the
 * boolean form).
 */
export function usePlatform(): "mac" | "other" | null {
  const [platform, setPlatform] = useState<"mac" | "other" | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    // userAgentData is the modern source of truth; navigator.platform
    // is deprecated but still returns useful strings in every shipping
    // browser today, so it's a safe fallback.
    const name =
      (navigator as Navigator & {
        userAgentData?: { platform?: string };
      }).userAgentData?.platform ??
      navigator.platform ??
      "";
    setPlatform(/mac|iphone|ipad|ipod/i.test(name) ? "mac" : "other");
  }, []);

  return platform;
}

/**
 * Boolean form of `usePlatform`. The default value is `false`
 * (Windows/Linux) — that means the first render on macOS briefly
 * shows the Windows label before the effect updates it. We accept
 * that micro-flicker over a hydration mismatch.
 */
export function usePlatformIsMac(): boolean {
  return usePlatform() === "mac";
}

/**
 * Helper to render the platform-appropriate label for a hotkey.
 * Pass the Mac and Windows/Linux variants and the helper picks one.
 *
 * Example: `formatShortcut(isMac, "⌘K", "Ctrl+K")`.
 */
export function formatShortcut(
  isMac: boolean,
  macLabel: string,
  otherLabel: string,
): string {
  return isMac ? macLabel : otherLabel;
}
