import { z } from "zod";
import { RESERVED_SLUGS } from "../usernames";

// Workspace slug validation — same rules as username slugs. The workspace slug
// is the first segment of every post URL (opendocs.cc/{workspace}/{slug}), so
// it needs the same collision-safety as usernames: lowercase, no special chars,
// and blocked against reserved route names.

export const workspaceSlugSchema = z
  .string()
  .trim()
  .min(3, "Workspace ID must be at least 3 characters.")
  .max(32, "Workspace ID must be at most 32 characters.")
  .regex(
    /^[a-z0-9_-]+$/,
    "Workspace ID may contain lowercase letters, numbers, hyphens, and underscores only.",
  );

export function normalizeWorkspaceSlug(slug: string) {
  return slug.trim().toLowerCase();
}

export function isReservedWorkspaceSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(normalizeWorkspaceSlug(slug));
}

// ---------------------------------------------------------------------------
// PDF export font whitelist
// ---------------------------------------------------------------------------
//
// Kept in sync with doc-converter/app/branding.py. The converter is
// LibreOffice-backed and falls back to a lookalike when a font isn't on
// the box, but we only want to offer fonts that are actually installed in
// the container so previews render the way users expect.
//
// `id` is what we send to the converter on the wire as `branding.font_main`.
// `label` is the pretty name shown in the picker.
// `category` lets the picker group sans vs. serif vs. mono.
// `cssStack` is used only in the web picker — a CSS font-family stack so
//   the preview string in the browser approximates what the PDF will look
//   like without having to embed the actual font file.

export type ExportFontCategory = "sans" | "serif" | "mono";

export interface ExportFontOption {
  id: string;
  label: string;
  category: ExportFontCategory;
  cssStack: string;
  description: string;
}

export const EXPORT_FONTS: readonly ExportFontOption[] = [
  {
    id: "Arial",
    label: "Arial",
    category: "sans",
    cssStack: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
    description: "Neutral sans — the default.",
  },
  {
    id: "Inter",
    label: "Inter",
    category: "sans",
    cssStack: "Inter, 'Helvetica Neue', Arial, sans-serif",
    description: "Modern geometric sans.",
  },
  {
    id: "IBM Plex Sans",
    label: "IBM Plex Sans",
    category: "sans",
    cssStack: "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
    description: "Corporate tech sans — distinctive and crisp.",
  },
  {
    id: "Lato",
    label: "Lato",
    category: "sans",
    cssStack: "Lato, 'Helvetica Neue', Arial, sans-serif",
    description: "Warm humanist sans.",
  },
  {
    id: "Roboto",
    label: "Roboto",
    category: "sans",
    cssStack: "Roboto, 'Helvetica Neue', Arial, sans-serif",
    description: "Familiar, neutral sans.",
  },
  {
    id: "Manrope",
    label: "Manrope",
    category: "sans",
    cssStack: "Manrope, 'Helvetica Neue', Arial, sans-serif",
    description: "Modern grotesque, crisp and current.",
  },
  {
    id: "Merriweather",
    label: "Merriweather",
    category: "serif",
    cssStack: "Merriweather, Georgia, 'Times New Roman', serif",
    description: "Screen-optimized serif — great for long reports.",
  },
  {
    id: "Vollkorn",
    label: "Vollkorn",
    category: "serif",
    cssStack: "Vollkorn, Georgia, 'Times New Roman', serif",
    description: "Editorial serif — reads like a book.",
  },
  {
    id: "EB Garamond",
    label: "EB Garamond",
    category: "serif",
    cssStack: "'EB Garamond', Garamond, Georgia, serif",
    description: "Classic Garamond, formal and elegant.",
  },
  {
    id: "JetBrains Mono",
    label: "JetBrains Mono",
    category: "mono",
    cssStack: "'JetBrains Mono', ui-monospace, Menlo, monospace",
    description: "Monospace for changelogs, runbooks and logs.",
  },
] as const;

export const EXPORT_FONT_IDS = EXPORT_FONTS.map((f) => f.id);
export const DEFAULT_EXPORT_FONT_ID = "Arial";

export function isValidExportFont(id: string): boolean {
  return EXPORT_FONT_IDS.includes(id);
}

export const exportFontSchema = z
  .string()
  .refine(isValidExportFont, { message: "Unknown font." });

// ---------------------------------------------------------------------------
// PDF export footer config
// ---------------------------------------------------------------------------

// Be forgiving about the URL shape: most users type `opendocs.cc` rather
// than `https://opendocs.cc` in a "footer link" field. Zod's built-in
// `.url()` rejects the bare form, which surfaces as a confusing 400 on
// save. We preprocess to auto-prefix `https://` when no scheme is
// present, then run the strict URL validator on the fixed-up value. An
// empty/whitespace input short-circuits to `null` (meaning "no link").
const linkUrlSchema = z.preprocess(
  (raw) => {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "string") return raw; // let Zod surface a type error
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    // Already has a scheme? Leave it alone — also lets users pass
    // http://localhost for self-hosted cases without us inserting https.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  },
  z.string().max(2048).url("Link must be a valid URL.").nullable(),
);

export const exportFooterSchema = z.object({
  enabled: z.boolean(),
  // All strings optional — empty/missing means "use the converter default".
  companyName: z.string().trim().max(120).nullable().optional(),
  tagline: z.string().trim().max(120).nullable().optional(),
  linkUrl: linkUrlSchema.optional(),
  linkLabel: z.string().trim().max(120).nullable().optional(),
});

export type ExportFooterInput = z.infer<typeof exportFooterSchema>;

// ---------------------------------------------------------------------------
// Free-plan export branding defaults
// ---------------------------------------------------------------------------
//
// Export font, export footer, brand color, and "show logo in exports" are
// Pro features. Free workspaces are seeded with these fixed values on
// creation and cannot change them via the workspace-settings endpoints.
// Customising any of them requires upgrading to Pro or Team.
export const FREE_PLAN_EXPORT_DEFAULTS = {
  exportFontMain: "Arial",
  brandColor: "#2E1C5C", // Purple 950 — matches db default + "Purple" preset.
  showLogoInExports: false,
  exportFooterEnabled: true,
  exportFooterCompanyName: "OpenDocs",
  exportFooterTagline: "Made with OpenDocs",
  exportFooterLinkUrl: "https://opendocs.cc",
  exportFooterLinkLabel: "opendocs.cc",
} as const;
