"use client";

import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "opendocs-theme";

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  Icon: typeof Sun;
}> = [
  {
    value: "light",
    label: "Light",
    description: "Use OpenDocs in light mode.",
    Icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Use OpenDocs in dark mode.",
    Icon: Moon,
  },
  {
    value: "system",
    label: "System",
    description: "Match your device setting.",
    Icon: Monitor,
  },
];

/** Light unless the reader picked Dark or System themselves. */
const DEFAULT_THEME: ThemePreference = "light";

function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function resolveDark(theme: ThemePreference) {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function applyTheme(theme: ThemePreference) {
  const isDark = resolveDark(theme);
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}

export function useThemePreference() {
  const [theme, setThemeState] = useState<ThemePreference>(DEFAULT_THEME);

  useEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    applyTheme(stored);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      if (readStoredTheme() === "system") {
        applyTheme("system");
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = readStoredTheme();
      setThemeState(next);
      applyTheme(next);
    };

    media.addEventListener("change", onMediaChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onMediaChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function setTheme(next: ThemePreference) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Strict privacy contexts can reject localStorage writes. The
      // selection still applies for the current page session.
    }
    setThemeState(next);
    applyTheme(next);
  }

  return { theme, setTheme };
}

export function ThemeMenuItems() {
  const { theme, setTheme } = useThemePreference();

  return (
    <div className="p-1.5">
      <DropdownMenuLabel className="px-2 pb-1 pt-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
        Appearance
      </DropdownMenuLabel>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100/70 p-1 dark:bg-zinc-900">
        {THEME_OPTIONS.map(({ value, label, Icon }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setTheme(value);
              }}
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition ${
                active
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-700"
                  : "text-zinc-500 hover:bg-white/70 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
              }`}
              aria-pressed={active}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ThemeDropdownButton() {
  const { theme, setTheme } = useThemePreference();
  const active = THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[2];
  const ActiveIcon = active.Icon;

  return (
    // Non-modal: a modal menu locks page scroll, which shifted the page
    // sideways and misplaced the menu on scrolled pages.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Change theme"
          className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-500 shadow-sm shadow-zinc-900/5 ring-1 ring-zinc-900/10 transition hover:text-primary hover:ring-zinc-900/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 dark:bg-zinc-900/85 dark:text-zinc-300 dark:shadow-black/20 dark:ring-white/10 dark:hover:text-violet-300 dark:hover:ring-white/20"
        >
          <ActiveIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-60 overflow-hidden rounded-2xl border-zinc-200 bg-white p-1.5 shadow-2xl shadow-zinc-900/12 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/35"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-1 bg-zinc-100 dark:bg-zinc-800" />
        {THEME_OPTIONS.map(({ value, label, description, Icon }) => {
          const selected = theme === value;
          return (
            <DropdownMenuItem
              key={value}
              onSelect={(event) => {
                event.preventDefault();
                setTheme(value);
              }}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 focus:bg-violet-50 dark:focus:bg-violet-400/10"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-300">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {label}
                </span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                  {description}
                </span>
              </span>
              {selected ? (
                <Check className="h-4 w-4 shrink-0 text-primary dark:text-violet-300" aria-hidden="true" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
