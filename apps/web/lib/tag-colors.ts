/**
 * Color palette for workspace tag chips.
 *
 * Tags are assigned an index per workspace (see `getWorkspaceTagOrder`
 * in `packages/shared/src/workspaces/service.ts` — first-seen ordering
 * via `MIN(postTags.createdAt)`). That index modulo PALETTE.length
 * picks an entry here, so the "first tag in a workspace is color 1,
 * second is color 2, ..." expectation holds for up to 48 unique tags
 * before colors wrap around.
 *
 * ## Why hand-written class strings?
 *
 * Tailwind v4 scans source files for literal class strings at build
 * time — anything computed like `bg-${hue}-100` is invisible to the
 * compiler and won't exist in the output CSS. Every string below must
 * appear VERBATIM so the JIT picks it up. This is more verbose than a
 * loop but makes the color set explicit and safe to prune.
 *
 * ## Layout / shape
 *
 * 16 Tailwind hues × 3 tones = 48 entries. Iterated in hue-major order
 * so consecutive indices land on different hues before cycling through
 * a darker or lighter tone — this keeps adjacent tags visually
 * distinct when a workspace has, say, 3-5 tags. `rose` intentionally
 * omitted (overlaps visually with pink + red) to round to 48.
 *
 * Each entry returns three string bundles:
 *  - `base`  — default state (`bg-xxx-100 text-xxx-700`-ish)
 *  - `hover` — slight deepening on hover, same hue
 *  - `active` — stronger variant + ring, for the sidebar's current-tag
 */

export type TagColorClasses = {
  base: string;
  hover: string;
  active: string;
};

const LIGHT_PALETTE: TagColorClasses[] = [
  // --- Tone 1: soft. -100 background, -700 text, -300 active ring ---
  {
    base: "bg-red-100 text-red-700",
    hover: "hover:bg-red-200 hover:text-red-800",
    active: "bg-red-200 text-red-900 ring-1 ring-red-300",
  },
  {
    base: "bg-orange-100 text-orange-700",
    hover: "hover:bg-orange-200 hover:text-orange-800",
    active: "bg-orange-200 text-orange-900 ring-1 ring-orange-300",
  },
  {
    base: "bg-amber-100 text-amber-800",
    hover: "hover:bg-amber-200 hover:text-amber-900",
    active: "bg-amber-200 text-amber-900 ring-1 ring-amber-300",
  },
  {
    base: "bg-yellow-100 text-yellow-800",
    hover: "hover:bg-yellow-200 hover:text-yellow-900",
    active: "bg-yellow-200 text-yellow-900 ring-1 ring-yellow-300",
  },
  {
    base: "bg-lime-100 text-lime-700",
    hover: "hover:bg-lime-200 hover:text-lime-800",
    active: "bg-lime-200 text-lime-900 ring-1 ring-lime-300",
  },
  {
    base: "bg-green-100 text-green-700",
    hover: "hover:bg-green-200 hover:text-green-800",
    active: "bg-green-200 text-green-900 ring-1 ring-green-300",
  },
  {
    base: "bg-emerald-100 text-emerald-700",
    hover: "hover:bg-emerald-200 hover:text-emerald-800",
    active: "bg-emerald-200 text-emerald-900 ring-1 ring-emerald-300",
  },
  {
    base: "bg-teal-100 text-teal-700",
    hover: "hover:bg-teal-200 hover:text-teal-800",
    active: "bg-teal-200 text-teal-900 ring-1 ring-teal-300",
  },
  {
    base: "bg-cyan-100 text-cyan-700",
    hover: "hover:bg-cyan-200 hover:text-cyan-800",
    active: "bg-cyan-200 text-cyan-900 ring-1 ring-cyan-300",
  },
  {
    base: "bg-sky-100 text-sky-700",
    hover: "hover:bg-sky-200 hover:text-sky-800",
    active: "bg-sky-200 text-sky-900 ring-1 ring-sky-300",
  },
  {
    base: "bg-blue-100 text-blue-700",
    hover: "hover:bg-blue-200 hover:text-blue-800",
    active: "bg-blue-200 text-blue-900 ring-1 ring-blue-300",
  },
  {
    base: "bg-indigo-100 text-indigo-700",
    hover: "hover:bg-indigo-200 hover:text-indigo-800",
    active: "bg-indigo-200 text-indigo-900 ring-1 ring-indigo-300",
  },
  {
    base: "bg-violet-100 text-violet-700",
    hover: "hover:bg-violet-200 hover:text-violet-800",
    active: "bg-violet-200 text-violet-900 ring-1 ring-violet-300",
  },
  {
    base: "bg-purple-100 text-purple-700",
    hover: "hover:bg-purple-200 hover:text-purple-800",
    active: "bg-purple-200 text-purple-900 ring-1 ring-purple-300",
  },
  {
    base: "bg-fuchsia-100 text-fuchsia-700",
    hover: "hover:bg-fuchsia-200 hover:text-fuchsia-800",
    active: "bg-fuchsia-200 text-fuchsia-900 ring-1 ring-fuchsia-300",
  },
  {
    base: "bg-pink-100 text-pink-700",
    hover: "hover:bg-pink-200 hover:text-pink-800",
    active: "bg-pink-200 text-pink-900 ring-1 ring-pink-300",
  },

  // --- Tone 2: medium. -200 background, -800 text, -400 active ring ---
  {
    base: "bg-red-200 text-red-800",
    hover: "hover:bg-red-300 hover:text-red-900",
    active: "bg-red-300 text-red-900 ring-1 ring-red-400",
  },
  {
    base: "bg-orange-200 text-orange-800",
    hover: "hover:bg-orange-300 hover:text-orange-900",
    active: "bg-orange-300 text-orange-900 ring-1 ring-orange-400",
  },
  {
    base: "bg-amber-200 text-amber-900",
    hover: "hover:bg-amber-300 hover:text-amber-900",
    active: "bg-amber-300 text-amber-900 ring-1 ring-amber-400",
  },
  {
    base: "bg-yellow-200 text-yellow-900",
    hover: "hover:bg-yellow-300 hover:text-yellow-900",
    active: "bg-yellow-300 text-yellow-900 ring-1 ring-yellow-400",
  },
  {
    base: "bg-lime-200 text-lime-800",
    hover: "hover:bg-lime-300 hover:text-lime-900",
    active: "bg-lime-300 text-lime-900 ring-1 ring-lime-400",
  },
  {
    base: "bg-green-200 text-green-800",
    hover: "hover:bg-green-300 hover:text-green-900",
    active: "bg-green-300 text-green-900 ring-1 ring-green-400",
  },
  {
    base: "bg-emerald-200 text-emerald-800",
    hover: "hover:bg-emerald-300 hover:text-emerald-900",
    active: "bg-emerald-300 text-emerald-900 ring-1 ring-emerald-400",
  },
  {
    base: "bg-teal-200 text-teal-800",
    hover: "hover:bg-teal-300 hover:text-teal-900",
    active: "bg-teal-300 text-teal-900 ring-1 ring-teal-400",
  },
  {
    base: "bg-cyan-200 text-cyan-800",
    hover: "hover:bg-cyan-300 hover:text-cyan-900",
    active: "bg-cyan-300 text-cyan-900 ring-1 ring-cyan-400",
  },
  {
    base: "bg-sky-200 text-sky-800",
    hover: "hover:bg-sky-300 hover:text-sky-900",
    active: "bg-sky-300 text-sky-900 ring-1 ring-sky-400",
  },
  {
    base: "bg-blue-200 text-blue-800",
    hover: "hover:bg-blue-300 hover:text-blue-900",
    active: "bg-blue-300 text-blue-900 ring-1 ring-blue-400",
  },
  {
    base: "bg-indigo-200 text-indigo-800",
    hover: "hover:bg-indigo-300 hover:text-indigo-900",
    active: "bg-indigo-300 text-indigo-900 ring-1 ring-indigo-400",
  },
  {
    base: "bg-violet-200 text-violet-800",
    hover: "hover:bg-violet-300 hover:text-violet-900",
    active: "bg-violet-300 text-violet-900 ring-1 ring-violet-400",
  },
  {
    base: "bg-purple-200 text-purple-800",
    hover: "hover:bg-purple-300 hover:text-purple-900",
    active: "bg-purple-300 text-purple-900 ring-1 ring-purple-400",
  },
  {
    base: "bg-fuchsia-200 text-fuchsia-800",
    hover: "hover:bg-fuchsia-300 hover:text-fuchsia-900",
    active: "bg-fuchsia-300 text-fuchsia-900 ring-1 ring-fuchsia-400",
  },
  {
    base: "bg-pink-200 text-pink-800",
    hover: "hover:bg-pink-300 hover:text-pink-900",
    active: "bg-pink-300 text-pink-900 ring-1 ring-pink-400",
  },

  // --- Tone 3: pale. -50 background, -600 text, -200 active ring ---
  {
    base: "bg-red-50 text-red-600",
    hover: "hover:bg-red-100 hover:text-red-700",
    active: "bg-red-100 text-red-800 ring-1 ring-red-200",
  },
  {
    base: "bg-orange-50 text-orange-600",
    hover: "hover:bg-orange-100 hover:text-orange-700",
    active: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",
  },
  {
    base: "bg-amber-50 text-amber-700",
    hover: "hover:bg-amber-100 hover:text-amber-800",
    active: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  },
  {
    base: "bg-yellow-50 text-yellow-700",
    hover: "hover:bg-yellow-100 hover:text-yellow-800",
    active: "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200",
  },
  {
    base: "bg-lime-50 text-lime-600",
    hover: "hover:bg-lime-100 hover:text-lime-700",
    active: "bg-lime-100 text-lime-800 ring-1 ring-lime-200",
  },
  {
    base: "bg-green-50 text-green-600",
    hover: "hover:bg-green-100 hover:text-green-700",
    active: "bg-green-100 text-green-800 ring-1 ring-green-200",
  },
  {
    base: "bg-emerald-50 text-emerald-600",
    hover: "hover:bg-emerald-100 hover:text-emerald-700",
    active: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  },
  {
    base: "bg-teal-50 text-teal-600",
    hover: "hover:bg-teal-100 hover:text-teal-700",
    active: "bg-teal-100 text-teal-800 ring-1 ring-teal-200",
  },
  {
    base: "bg-cyan-50 text-cyan-600",
    hover: "hover:bg-cyan-100 hover:text-cyan-700",
    active: "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200",
  },
  {
    base: "bg-sky-50 text-sky-600",
    hover: "hover:bg-sky-100 hover:text-sky-700",
    active: "bg-sky-100 text-sky-800 ring-1 ring-sky-200",
  },
  {
    base: "bg-blue-50 text-blue-600",
    hover: "hover:bg-blue-100 hover:text-blue-700",
    active: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
  },
  {
    base: "bg-indigo-50 text-indigo-600",
    hover: "hover:bg-indigo-100 hover:text-indigo-700",
    active: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200",
  },
  {
    base: "bg-violet-50 text-violet-600",
    hover: "hover:bg-violet-100 hover:text-violet-700",
    active: "bg-violet-100 text-violet-800 ring-1 ring-violet-200",
  },
  {
    base: "bg-purple-50 text-purple-600",
    hover: "hover:bg-purple-100 hover:text-purple-700",
    active: "bg-purple-100 text-purple-800 ring-1 ring-purple-200",
  },
  {
    base: "bg-fuchsia-50 text-fuchsia-600",
    hover: "hover:bg-fuchsia-100 hover:text-fuchsia-700",
    active: "bg-fuchsia-100 text-fuchsia-800 ring-1 ring-fuchsia-200",
  },
  {
    base: "bg-pink-50 text-pink-600",
    hover: "hover:bg-pink-100 hover:text-pink-700",
    active: "bg-pink-100 text-pink-800 ring-1 ring-pink-200",
  },
];

const DARK_PALETTE: TagColorClasses[] = [
  {
    base: "dark:!bg-red-400/20 dark:!text-red-200",
    hover: "dark:hover:!bg-red-400/30 dark:hover:!text-red-100",
    active: "dark:!bg-red-400/30 dark:!text-red-100 dark:!ring-red-400/40",
  },
  {
    base: "dark:!bg-orange-400/20 dark:!text-orange-200",
    hover: "dark:hover:!bg-orange-400/30 dark:hover:!text-orange-100",
    active: "dark:!bg-orange-400/30 dark:!text-orange-100 dark:!ring-orange-400/40",
  },
  {
    base: "dark:!bg-amber-400/20 dark:!text-amber-200",
    hover: "dark:hover:!bg-amber-400/30 dark:hover:!text-amber-100",
    active: "dark:!bg-amber-400/30 dark:!text-amber-100 dark:!ring-amber-400/40",
  },
  {
    base: "dark:!bg-yellow-400/20 dark:!text-yellow-200",
    hover: "dark:hover:!bg-yellow-400/30 dark:hover:!text-yellow-100",
    active: "dark:!bg-yellow-400/30 dark:!text-yellow-100 dark:!ring-yellow-400/40",
  },
  {
    base: "dark:!bg-lime-400/20 dark:!text-lime-200",
    hover: "dark:hover:!bg-lime-400/30 dark:hover:!text-lime-100",
    active: "dark:!bg-lime-400/30 dark:!text-lime-100 dark:!ring-lime-400/40",
  },
  {
    base: "dark:!bg-green-400/20 dark:!text-green-200",
    hover: "dark:hover:!bg-green-400/30 dark:hover:!text-green-100",
    active: "dark:!bg-green-400/30 dark:!text-green-100 dark:!ring-green-400/40",
  },
  {
    base: "dark:!bg-emerald-400/20 dark:!text-emerald-200",
    hover: "dark:hover:!bg-emerald-400/30 dark:hover:!text-emerald-100",
    active: "dark:!bg-emerald-400/30 dark:!text-emerald-100 dark:!ring-emerald-400/40",
  },
  {
    base: "dark:!bg-teal-400/20 dark:!text-teal-200",
    hover: "dark:hover:!bg-teal-400/30 dark:hover:!text-teal-100",
    active: "dark:!bg-teal-400/30 dark:!text-teal-100 dark:!ring-teal-400/40",
  },
  {
    base: "dark:!bg-cyan-400/20 dark:!text-cyan-200",
    hover: "dark:hover:!bg-cyan-400/30 dark:hover:!text-cyan-100",
    active: "dark:!bg-cyan-400/30 dark:!text-cyan-100 dark:!ring-cyan-400/40",
  },
  {
    base: "dark:!bg-sky-400/20 dark:!text-sky-200",
    hover: "dark:hover:!bg-sky-400/30 dark:hover:!text-sky-100",
    active: "dark:!bg-sky-400/30 dark:!text-sky-100 dark:!ring-sky-400/40",
  },
  {
    base: "dark:!bg-blue-400/20 dark:!text-blue-200",
    hover: "dark:hover:!bg-blue-400/30 dark:hover:!text-blue-100",
    active: "dark:!bg-blue-400/30 dark:!text-blue-100 dark:!ring-blue-400/40",
  },
  {
    base: "dark:!bg-indigo-400/20 dark:!text-indigo-200",
    hover: "dark:hover:!bg-indigo-400/30 dark:hover:!text-indigo-100",
    active: "dark:!bg-indigo-400/30 dark:!text-indigo-100 dark:!ring-indigo-400/40",
  },
  {
    base: "dark:!bg-violet-400/20 dark:!text-violet-200",
    hover: "dark:hover:!bg-violet-400/30 dark:hover:!text-violet-100",
    active: "dark:!bg-violet-400/30 dark:!text-violet-100 dark:!ring-violet-400/40",
  },
  {
    base: "dark:!bg-purple-400/20 dark:!text-purple-200",
    hover: "dark:hover:!bg-purple-400/30 dark:hover:!text-purple-100",
    active: "dark:!bg-purple-400/30 dark:!text-purple-100 dark:!ring-purple-400/40",
  },
  {
    base: "dark:!bg-fuchsia-400/20 dark:!text-fuchsia-200",
    hover: "dark:hover:!bg-fuchsia-400/30 dark:hover:!text-fuchsia-100",
    active: "dark:!bg-fuchsia-400/30 dark:!text-fuchsia-100 dark:!ring-fuchsia-400/40",
  },
  {
    base: "dark:!bg-pink-400/20 dark:!text-pink-200",
    hover: "dark:hover:!bg-pink-400/30 dark:hover:!text-pink-100",
    active: "dark:!bg-pink-400/30 dark:!text-pink-100 dark:!ring-pink-400/40",
  },
];

const PALETTE: TagColorClasses[] = LIGHT_PALETTE.map((entry, index) => {
  const dark = DARK_PALETTE[index % DARK_PALETTE.length]!;
  return {
    base: `${entry.base} ${dark.base}`,
    hover: `${entry.hover} ${dark.hover}`,
    active: `${entry.active} ${dark.active}`,
  };
});

/**
 * Fallback color for tags that somehow slip through without a known
 * index — defensive default for legacy data or race conditions where
 * the render path runs before the ordering fetch finishes. Uses the
 * original zinc palette so the chip still reads as a chip.
 */
const FALLBACK: TagColorClasses = {
  base: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  hover: "hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-zinc-700 dark:hover:text-zinc-100",
  active: "bg-zinc-200 text-zinc-900 ring-1 ring-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:ring-zinc-600",
};

/**
 * Map a 0-based workspace tag index to a palette entry. Wraps with
 * modulo so workspaces with more than 48 unique tags keep rendering
 * colored chips (at the cost of a few colors repeating).
 */
export function getTagColor(index: number | undefined | null): TagColorClasses {
  if (index == null || !Number.isFinite(index) || index < 0) return FALLBACK;
  const wrapped = Math.floor(index) % PALETTE.length;
  return PALETTE[wrapped] ?? FALLBACK;
}

/**
 * Convenience lookup when you have the tag string + the workspace's
 * tag→index map (what the server fetchers return). Keeps the call site
 * a one-liner: `getTagColorFor(tag, tagColorIndex).base`.
 */
export function getTagColorFor(
  tag: string,
  tagColorIndex: Record<string, number> | undefined,
): TagColorClasses {
  if (!tagColorIndex) return FALLBACK;
  const index = tagColorIndex[tag.toLowerCase()];
  return getTagColor(index);
}

export const TAG_COLOR_PALETTE_SIZE = PALETTE.length;
