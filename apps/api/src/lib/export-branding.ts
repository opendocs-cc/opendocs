/**
 * Workspace-driven defaults for the doc-converter's `branding` payload.
 *
 * Export endpoints receive an optional caller-supplied `branding` object
 * (and a top-level `accent_color`) which should layer on top of whatever
 * the post's workspace has configured in Workspace Settings. Precedence:
 *
 *   converter built-ins  ←  workspace defaults  ←  caller body
 *
 * i.e. the caller can always override, but if they don't pass anything
 * (which is the common case when the dashboard or CLI exports), we fall
 * back to the workspace's stored defaults, and only then to the
 * converter's own baked-in fallbacks.
 *
 * Brand color, font and logo apply on every plan. The footer is the Pro/
 * Team part: a Free workspace (including one that downgraded) always
 * exports with the "Made with OpenDocs" footer. Its stored footer stays
 * untouched, so it applies again after an upgrade.
 */

import { inArray } from "drizzle-orm";
import { getDbOrThrow } from "@opendocs/shared/db/guards";
import { workspaces } from "@opendocs/shared/db/schema";
import { FREE_PLAN_EXPORT_DEFAULTS } from "@opendocs/shared/workspaces/validation";
import { getEffectiveWorkspaceTier } from "@opendocs/shared/workspaces/service";

export interface WorkspaceExportDefaults {
  id: string;
  name: string;
  brandColor: string;
  logoUrl: string | null;
  showLogoInExports: boolean;
  exportFontMain: string | null;
  exportFooterEnabled: boolean;
  exportFooterCompanyName: string | null;
  exportFooterTagline: string | null;
  exportFooterLinkUrl: string | null;
  exportFooterLinkLabel: string | null;
}

/**
 * Fetch export-relevant columns for a set of workspace IDs in one round
 * trip. Callers hand this a list of workspaceIds (batch export can span
 * multiple workspaces if the CLI user is in more than one) and get a
 * Map keyed by id back. Free workspaces get the OpenDocs footer in place
 * of their stored one (see the header comment).
 */
export async function getWorkspaceExportDefaultsMap(
  workspaceIds: Array<string | null | undefined>,
): Promise<Map<string, WorkspaceExportDefaults>> {
  const unique = Array.from(
    new Set(workspaceIds.filter((id): id is string => !!id)),
  );
  const map = new Map<string, WorkspaceExportDefaults>();
  if (unique.length === 0) return map;

  const db = getDbOrThrow();
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      brandColor: workspaces.brandColor,
      logoUrl: workspaces.logoUrl,
      showLogoInExports: workspaces.showLogoInExports,
      exportFontMain: workspaces.exportFontMain,
      exportFooterEnabled: workspaces.exportFooterEnabled,
      exportFooterCompanyName: workspaces.exportFooterCompanyName,
      exportFooterTagline: workspaces.exportFooterTagline,
      exportFooterLinkUrl: workspaces.exportFooterLinkUrl,
      exportFooterLinkLabel: workspaces.exportFooterLinkLabel,
    })
    .from(workspaces)
    .where(inArray(workspaces.id, unique));

  // Free exports always carry the OpenDocs footer, whatever is stored (a
  // workspace that downgraded from Pro still has its own footer saved).
  const tiers = await Promise.all(rows.map((row) => getEffectiveWorkspaceTier(row.id)));
  rows.forEach((row, i) => {
    const paid = tiers[i] === "pro" || tiers[i] === "team";
    map.set(row.id, paid ? row : { ...row, ...FREE_PLAN_FOOTER });
  });
  return map;
}

// The printed footer still reads "opendocs.cc"; the link behind it carries
// a UTM tag so signups from shared Free PDFs show up in analytics.
const FREE_PLAN_FOOTER = {
  exportFooterEnabled: FREE_PLAN_EXPORT_DEFAULTS.exportFooterEnabled,
  exportFooterCompanyName: FREE_PLAN_EXPORT_DEFAULTS.exportFooterCompanyName,
  exportFooterTagline: FREE_PLAN_EXPORT_DEFAULTS.exportFooterTagline,
  exportFooterLinkUrl: "https://opendocs.cc/?utm_source=pdf&utm_medium=export",
  exportFooterLinkLabel: FREE_PLAN_EXPORT_DEFAULTS.exportFooterLinkLabel,
} as const;

export interface BodyBranding {
  accent_color?: string;
  branding?: Record<string, unknown>;
}

export interface ResolvedBranding {
  accent_color: string | undefined;
  branding: Record<string, unknown> | undefined;
}

/**
 * Merge a caller-supplied body with the owning workspace's defaults into
 * the exact shape `convertMarkdown()` wants.
 *
 * If the workspace has `exportFooterEnabled === false`, all three footer
 * fields (`company_name`, `footer_subtitle`, `company_url`) are zeroed
 * out — the converter renders an empty footer paragraph when all three
 * are falsy (see doc-converter/app/converter.py:240-293).
 */
export function resolveExportBranding(
  workspace: WorkspaceExportDefaults | undefined,
  body: BodyBranding,
): ResolvedBranding {
  if (!workspace) {
    return {
      accent_color: body.accent_color,
      branding: body.branding,
    };
  }

  const bodyBranding = body.branding ?? {};

  // Build the workspace's preferred branding. Every key here is optional
  // on the wire — if a field is `null` on the workspace (meaning "use
  // converter defaults"), we simply don't include it, which lets the
  // Pydantic model on the other end apply its own default.
  const wsBranding: Record<string, unknown> = {};

  if (workspace.exportFontMain) {
    wsBranding.font_main = workspace.exportFontMain;
  }

  // Logo in exports: only send logo_url if the toggle is on AND a logo
  // actually exists. Otherwise let the converter fall back to the
  // built-in OpenDocs mark (which it does when logo_url is unset).
  if (workspace.showLogoInExports && workspace.logoUrl) {
    wsBranding.logo_url = workspace.logoUrl;
  }

  if (workspace.exportFooterEnabled) {
    // Line 1 — company name. Fall back to workspace display name if the
    // admin hasn't explicitly set a footer company name.
    wsBranding.company_name =
      workspace.exportFooterCompanyName ?? workspace.name;

    if (workspace.exportFooterTagline !== null) {
      wsBranding.footer_subtitle = workspace.exportFooterTagline;
    }
    if (workspace.exportFooterLinkUrl !== null) {
      wsBranding.company_url = workspace.exportFooterLinkUrl;
    }
    if (workspace.exportFooterLinkLabel !== null) {
      wsBranding.company_url_label = workspace.exportFooterLinkLabel;
    }
  } else {
    // Suppress the whole footer by blanking every field. The converter
    // treats "" / null for all three line-1/line-2 pieces as "don't
    // render the footer paragraph".
    wsBranding.company_name = "";
    wsBranding.footer_subtitle = null;
    wsBranding.company_url = "";
  }

  // Caller body wins. This lets a CLI invocation that explicitly passes
  // `--accent-color` or a custom `branding.font_main` override the
  // stored defaults without us having to special-case each field.
  const merged: Record<string, unknown> = { ...wsBranding, ...bodyBranding };

  return {
    accent_color: body.accent_color ?? workspace.brandColor,
    branding: Object.keys(merged).length > 0 ? merged : undefined,
  };
}
