/**
 * Export branding presets and color rules. Client-safe (no database
 * imports), so the web settings page can use the same presets and
 * contrast checks as the API. Server-side reads and updates live in
 * `./branding`.
 *
 * How the converter uses the brand color (doc-converter/app/themes.py,
 * `brand_from_accent`): heading and link color on white paper, the
 * background behind white table-header text, and the footer brand line.
 * A 94% white mix of it tints table zebra rows and code blocks. Body text
 * is always near-black (#171717) and isn't configurable, so the rule that
 * matters is that the brand color is dark enough to read as text on white
 * and to carry white text on top of it.
 */
export type BrandingPreset = {
  id: string;
  name: string;
  description: string;
  brandColor: string;
  fontId: string;
};

/**
 * Curated brand color + export font pairs. Every accent clears WCAG AAA
 * (7:1) against white, so headings read well and white table-header text
 * stays legible. Font ids must exist in `EXPORT_FONTS`.
 */
export const BRANDING_PRESETS: readonly BrandingPreset[] = [
  {
    id: "classic",
    name: "Classic",
    description: "The OpenDocs house style.",
    brandColor: "#2E1C5C",
    fontId: "Arial",
  },
  {
    id: "boardroom",
    name: "Boardroom",
    description: "Board updates, investor memos, policies.",
    brandColor: "#13294B",
    fontId: "IBM Plex Sans",
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Essays and long reports that read like a book.",
    brandColor: "#6E1F2A",
    fontId: "Vollkorn",
  },
  {
    id: "research",
    name: "Research",
    description: "Whitepapers, studies and technical reports.",
    brandColor: "#1F4D3A",
    fontId: "Merriweather",
  },
  {
    id: "studio",
    name: "Studio",
    description: "Product specs, design docs, release notes.",
    brandColor: "#1F2328",
    fontId: "Inter",
  },
  {
    id: "field-guide",
    name: "Field guide",
    description: "Handbooks, onboarding and how-to guides.",
    brandColor: "#0F4C5C",
    fontId: "Lato",
  },
  {
    id: "letterpress",
    name: "Letterpress",
    description: "Proposals, letters and formal reports.",
    brandColor: "#7C2D12",
    fontId: "EB Garamond",
  },
  {
    id: "terminal",
    name: "Terminal",
    description: "Changelogs, runbooks and incident reviews.",
    brandColor: "#1E40AF",
    fontId: "JetBrains Mono",
  },
  {
    id: "launch",
    name: "Launch",
    description: "Launch briefs, one-pagers and announcements.",
    brandColor: "#86198F",
    fontId: "Manrope",
  },
] as const;

/** Below this contrast against white the brand color is rejected (WCAG AA). */
export const MIN_BRAND_CONTRAST = 4.5;
/** At or above this the brand color is comfortable for long documents (WCAG AAA). */
export const RECOMMENDED_BRAND_CONTRAST = 7;

export function findPreset(id: string) {
  const normalized = id.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return BRANDING_PRESETS.find((preset) => preset.id === normalized) ?? null;
}

/** The preset matching a color + font pair, if any (color is case-insensitive). */
export function findMatchingPreset(brandColor: string, fontId: string) {
  return (
    BRANDING_PRESETS.find(
      (preset) =>
        preset.brandColor.toLowerCase() === brandColor.toLowerCase() &&
        preset.fontId === fontId,
    ) ?? null
  );
}

export function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#rrggbb` colors, rounded to 2 decimals. */
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** `hex` mixed with white; `whiteShare` 0..1. Mirrors the converter's tints. */
export function mixWithWhite(hex: string, whiteShare: number) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${channels
    .map((c) => Math.round(c * (1 - whiteShare) + 255 * whiteShare).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** How well a brand color works for exports (contrast is measured against white). */
export function assessBrandColor(hex: string) {
  const contrast = contrastRatio(hex, "#FFFFFF");
  const level =
    contrast >= RECOMMENDED_BRAND_CONTRAST
      ? ("great" as const)
      : contrast >= MIN_BRAND_CONTRAST
        ? ("ok" as const)
        : ("too_light" as const);
  return { contrast, level };
}

/** Plain-language rules, returned by the API so agents can follow them. */
export const BRANDING_GUIDELINES = [
  "Start from a preset when you can; each is a tested color and font pair.",
  "The brand color is used for headings, links and table headers (with white text on it), so it must be dark: at least 4.5:1 contrast against white, ideally 7:1 or more.",
  "Body text is always near-black (#171717) for readability; you can't and shouldn't change it.",
  "Use the deepest usable shade of the brand's hue (a navy rather than a bright blue, a forest green rather than a lime).",
  "Pick a serif (Merriweather, Vollkorn, EB Garamond) for long, reading-heavy documents, a sans (Inter, IBM Plex Sans, Lato, Roboto, Manrope, Arial) for specs, memos and handbooks, and JetBrains Mono for technical logs like changelogs and incident reviews.",
  "Confirm the change with your human first: branding applies to every PDF and Word export in the workspace.",
];
