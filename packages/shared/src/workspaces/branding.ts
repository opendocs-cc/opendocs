/**
 * Export branding reads and updates for agents (CLI, API keys). Presets,
 * contrast rules and guidelines live in the client-safe
 * `./branding-presets` module.
 */
import { and, eq } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import { workspaceMembers, workspaces } from "../db/schema";
import {
  BRANDING_GUIDELINES,
  BRANDING_PRESETS,
  MIN_BRAND_CONTRAST,
  RECOMMENDED_BRAND_CONTRAST,
  assessBrandColor,
  findMatchingPreset,
  findPreset,
  isHexColor,
} from "./branding-presets";
import { getEffectiveWorkspaceTier } from "./service";
import {
  EXPORT_FONTS,
  exportFooterSchema,
  isValidExportFont,
  DEFAULT_EXPORT_FONT_ID,
  FREE_PLAN_EXPORT_DEFAULTS,
} from "./validation";

export * from "./branding-presets";

type Membership = { role: "owner" | "admin" | "member" };

async function getMembership(userId: string, workspaceId: string): Promise<Membership | null> {
  const database = getDbOrThrow();
  const [membership] = await database
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active"),
      ),
    )
    .limit(1);
  return membership ?? null;
}

async function readBrandingRow(workspaceId: string) {
  const database = getDbOrThrow();
  const [row] = await database
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      name: workspaces.name,
      brandColor: workspaces.brandColor,
      exportFontMain: workspaces.exportFontMain,
      logoUrl: workspaces.logoUrl,
      showLogoInExports: workspaces.showLogoInExports,
      exportFooterEnabled: workspaces.exportFooterEnabled,
      exportFooterCompanyName: workspaces.exportFooterCompanyName,
      exportFooterTagline: workspaces.exportFooterTagline,
      exportFooterLinkUrl: workspaces.exportFooterLinkUrl,
      exportFooterLinkLabel: workspaces.exportFooterLinkLabel,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return row ?? null;
}

function shapeBranding(
  row: NonNullable<Awaited<ReturnType<typeof readBrandingRow>>>,
  role: Membership["role"],
  tier: string,
) {
  const font = row.exportFontMain ?? DEFAULT_EXPORT_FONT_ID;
  const isPaid = tier === "pro" || tier === "team";
  return {
    workspace: { id: row.id, slug: row.slug, name: row.name },
    role,
    tier,
    /** True when this caller may change brand color, font, presets and logo-in-exports (owners and admins, any plan). */
    canEdit: role !== "member",
    /** True when this caller may change the export footer (owners and admins on Pro or Team). */
    canEditFooter: isPaid && role !== "member",
    branding: {
      brandColor: row.brandColor,
      font,
      preset: findMatchingPreset(row.brandColor, font)?.id ?? null,
      contrast: assessBrandColor(row.brandColor),
      logoUrl: row.logoUrl,
      showLogoInExports: row.showLogoInExports,
      // Free exports always print the OpenDocs footer, whatever is stored
      // (a workspace that left Pro keeps its old footer for when it returns).
      footer: isPaid
        ? {
            enabled: row.exportFooterEnabled,
            companyName: row.exportFooterCompanyName,
            tagline: row.exportFooterTagline,
            linkUrl: row.exportFooterLinkUrl,
            linkLabel: row.exportFooterLinkLabel,
          }
        : {
            enabled: FREE_PLAN_EXPORT_DEFAULTS.exportFooterEnabled,
            companyName: FREE_PLAN_EXPORT_DEFAULTS.exportFooterCompanyName,
            tagline: FREE_PLAN_EXPORT_DEFAULTS.exportFooterTagline,
            linkUrl: FREE_PLAN_EXPORT_DEFAULTS.exportFooterLinkUrl,
            linkLabel: FREE_PLAN_EXPORT_DEFAULTS.exportFooterLinkLabel,
          },
    },
    presets: BRANDING_PRESETS,
    fonts: EXPORT_FONTS.map(({ id, label, category, description }) => ({
      id,
      label,
      category,
      description,
    })),
    guidelines: {
      minContrast: MIN_BRAND_CONTRAST,
      recommendedContrast: RECOMMENDED_BRAND_CONTRAST,
      rules: BRANDING_GUIDELINES,
    },
  };
}

export type WorkspaceBranding = ReturnType<typeof shapeBranding>;

/** Current export branding plus the presets, fonts and rules for changing it. */
export async function getWorkspaceBranding(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceBranding | { error: "not_found" }> {
  const membership = await getMembership(userId, workspaceId);
  if (!membership) return { error: "not_found" };
  const [row, tier] = await Promise.all([
    readBrandingRow(workspaceId),
    getEffectiveWorkspaceTier(workspaceId),
  ]);
  if (!row) return { error: "not_found" };
  return shapeBranding(row, membership.role, tier ?? "free");
}

export type BrandingUpdateInput = {
  preset?: string;
  brandColor?: string;
  font?: string;
  showLogoInExports?: boolean;
  footer?: {
    enabled?: boolean;
    companyName?: string | null;
    tagline?: string | null;
    linkUrl?: string | null;
    linkLabel?: string | null;
  };
  /** Skip the minimum-contrast check (the result is still reported). */
  allowLowContrast?: boolean;
};

export type BrandingUpdateError =
  | { error: "not_found" }
  | { error: "forbidden" }
  | { error: "plan_required"; tier: string }
  | { error: "invalid_preset"; presets: string[] }
  | { error: "invalid_color" }
  | { error: "low_contrast"; contrast: number; minContrast: number }
  | { error: "invalid_font"; fonts: string[] }
  | { error: "invalid_footer"; message: string }
  | { error: "nothing_to_change" };

/**
 * Applies a preset and/or individual branding fields in one write. A preset
 * sets brand color and font; explicit `brandColor` / `font` override it.
 * Admin/owner only. Every plan can brand its exports; the footer is Pro
 * and Team only (Free exports say "Made with OpenDocs").
 */
export async function updateWorkspaceBranding(
  userId: string,
  workspaceId: string,
  input: BrandingUpdateInput,
): Promise<WorkspaceBranding | BrandingUpdateError> {
  const membership = await getMembership(userId, workspaceId);
  if (!membership) return { error: "not_found" };
  if (membership.role === "member") return { error: "forbidden" };

  const tier = (await getEffectiveWorkspaceTier(workspaceId)) ?? "free";
  if (input.footer && tier !== "pro" && tier !== "team") return { error: "plan_required", tier };

  const current = await readBrandingRow(workspaceId);
  if (!current) return { error: "not_found" };

  const patch: Partial<typeof workspaces.$inferInsert> = {};

  if (input.preset !== undefined) {
    const preset = findPreset(input.preset);
    if (!preset) {
      return { error: "invalid_preset", presets: BRANDING_PRESETS.map((p) => p.id) };
    }
    patch.brandColor = preset.brandColor;
    patch.exportFontMain = preset.fontId;
  }

  if (input.brandColor !== undefined) {
    const color = input.brandColor.trim();
    const hex = color.startsWith("#") ? color : `#${color}`;
    if (!isHexColor(hex)) return { error: "invalid_color" };
    patch.brandColor = hex.toUpperCase();
  }
  if (patch.brandColor && !input.allowLowContrast) {
    const { contrast } = assessBrandColor(patch.brandColor);
    if (contrast < MIN_BRAND_CONTRAST) {
      return { error: "low_contrast", contrast, minContrast: MIN_BRAND_CONTRAST };
    }
  }

  if (input.font !== undefined) {
    const match = EXPORT_FONTS.find(
      (font) => font.id.toLowerCase() === input.font!.trim().toLowerCase(),
    );
    if (!match || !isValidExportFont(match.id)) {
      return { error: "invalid_font", fonts: EXPORT_FONTS.map((f) => f.id) };
    }
    patch.exportFontMain = match.id;
  }

  if (input.showLogoInExports !== undefined) {
    patch.showLogoInExports = input.showLogoInExports;
  }

  if (input.footer) {
    // Merge with the stored footer so agents can change one line at a time.
    const merged = {
      enabled: input.footer.enabled ?? current.exportFooterEnabled,
      companyName:
        input.footer.companyName !== undefined
          ? input.footer.companyName
          : current.exportFooterCompanyName,
      tagline:
        input.footer.tagline !== undefined ? input.footer.tagline : current.exportFooterTagline,
      linkUrl:
        input.footer.linkUrl !== undefined ? input.footer.linkUrl : current.exportFooterLinkUrl,
      linkLabel:
        input.footer.linkLabel !== undefined
          ? input.footer.linkLabel
          : current.exportFooterLinkLabel,
    };
    const parsed = exportFooterSchema.safeParse(merged);
    if (!parsed.success) {
      return {
        error: "invalid_footer",
        message: parsed.error.issues[0]?.message ?? "Invalid footer.",
      };
    }
    const nullish = (value: string | null | undefined) =>
      value === undefined || value === null || value === "" ? null : value;
    patch.exportFooterEnabled = parsed.data.enabled;
    patch.exportFooterCompanyName = nullish(parsed.data.companyName);
    patch.exportFooterTagline = nullish(parsed.data.tagline);
    patch.exportFooterLinkUrl = nullish(parsed.data.linkUrl);
    patch.exportFooterLinkLabel = nullish(parsed.data.linkLabel);
  }

  if (Object.keys(patch).length === 0) return { error: "nothing_to_change" };

  const database = getDbOrThrow();
  await database
    .update(workspaces)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  const updated = await readBrandingRow(workspaceId);
  return shapeBranding(updated!, membership.role, tier);
}
