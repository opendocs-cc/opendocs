"use client";

import { usePlatform } from "@/lib/use-platform";

type ShortcutHintProps = {
  /** Label on macOS / iOS, e.g. "⌘K". */
  mac: string;
  /** Label on Windows and Linux, e.g. "Ctrl+K". */
  other: string;
  /**
   * Classes for the badge. Include the display rule, gated with
   * `pointer-fine:` so touch screens, which have no keys to learn,
   * never show it.
   */
  className: string;
};

/**
 * Keyboard-shortcut badge inside a trigger button. Hidden from screen
 * readers (the button carries `aria-keyshortcuts`), and invisible until
 * the platform is known so Macs never flash the Ctrl label.
 */
export function ShortcutHint({ mac, other, className }: ShortcutHintProps) {
  const platform = usePlatform();
  return (
    <kbd
      aria-hidden="true"
      className={`select-none ${platform === null ? "invisible" : ""} ${className}`}
    >
      {platform === "mac" ? mac : other}
    </kbd>
  );
}
