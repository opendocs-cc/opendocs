import { z } from "zod";

import { UserFacingError } from "../lib/errors";
import { ok } from "../lib/result";
import { defineTool, READ_ONLY, WRITE } from "./types";

/**
 * The export theme: brand colour, font, logo and footer of every PDF and
 * Word export in a workspace. One read with everything needed to choose
 * (current settings, presets, fonts, contrast rules) and one write, the
 * same routes as the CLI's `opendocs theme`.
 */

type Footer = {
  enabled: boolean;
  companyName: string | null;
  tagline: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
};

type WorkspaceBranding = {
  workspace: { id: string; slug: string; name: string };
  role: string;
  tier: string;
  canEdit: boolean;
  canEditFooter: boolean;
  branding: {
    brandColor: string;
    font: string;
    preset: string | null;
    contrast: { contrast: number; level: "great" | "ok" | "too_light" };
    logoUrl: string | null;
    showLogoInExports: boolean;
    footer: Footer;
  };
  presets: Array<{ id: string; name: string; description: string; brandColor: string; fontId: string }>;
  fonts: Array<{ id: string; label: string; category: string; description: string }>;
  guidelines: { minContrast: number; recommendedContrast: number; rules: string[] };
};

const workspaceArg = z
  .string()
  .optional()
  .describe("Workspace name, slug or ID. Defaults to this connection's default workspace.");

function contrastText(contrast: { contrast: number; level: string }): string {
  const verdict =
    contrast.level === "great"
      ? "great for long documents"
      : contrast.level === "ok"
        ? "readable; a darker shade would be easier on the eyes"
        : "too light: headings fade and white table-header text becomes unreadable";
  return `${contrast.contrast}:1 on white, ${verdict}`;
}

function logoText(b: WorkspaceBranding["branding"]): string {
  if (!b.logoUrl) return "none";
  return b.showLogoInExports ? "shown in exports" : "uploaded, hidden in exports";
}

function footerText(data: WorkspaceBranding): string {
  const f = data.branding.footer;
  if (!f.enabled) return "hidden";
  return [f.companyName ?? data.workspace.name, f.tagline, f.linkLabel ?? f.linkUrl].filter(Boolean).join(" · ");
}

function currentLines(data: WorkspaceBranding): string[] {
  const b = data.branding;
  return [
    `- Brand colour: ${b.brandColor} (${contrastText(b.contrast)})`,
    `- Font: ${b.font}`,
    `- Preset: ${b.preset ?? "custom"}`,
    `- Logo: ${logoText(b)}`,
    `- Footer: ${footerText(data)}`,
  ];
}

function summary(data: WorkspaceBranding) {
  return {
    workspace: data.workspace,
    tier: data.tier,
    canEdit: data.canEdit,
    canEditFooter: data.canEditFooter,
    ...data.branding,
  };
}

export const getExportTheme = defineTool({
  name: "get_export_theme",
  title: "Get the export theme",
  description:
    "The look of the workspace's PDF and Word exports: brand colour, font, preset, logo and footer, whether the user may change them, plus the curated presets (with what each suits), the available fonts and the contrast rules. Call it before proposing a theme change with update_export_theme.",
  scope: "docs:read",
  annotations: READ_ONLY,
  input: z.object({ workspace: workspaceArg }),
  async run(args, ctx) {
    const workspace = await ctx.resolveWorkspace(args.workspace);
    const data = await ctx.api.get<WorkspaceBranding>("/workspace/branding", { workspaceId: workspace.id });
    const lines = [`Export theme for ${data.workspace.name} (${data.tier} plan):`, ...currentLines(data)];
    if (!data.canEdit) {
      lines.push("Only owners and admins can change the theme.");
    } else if (!data.canEditFooter) {
      lines.push(
        `The user can change the colour, font, preset and logo. Exports keep the "Made with OpenDocs" footer: changing it isn't included in this workspace's plan.`,
      );
    } else {
      lines.push("The user can change every part of the theme, footer included.");
    }
    lines.push("", "Presets (tested colour and font pairs; prefer one):");
    for (const p of data.presets) {
      lines.push(`- ${p.id}: ${p.brandColor} with ${p.fontId}. ${p.description}${data.branding.preset === p.id ? " (current)" : ""}`);
    }
    lines.push("", "Fonts:");
    for (const f of data.fonts) lines.push(`- ${f.id} (${f.category}): ${f.description}`);
    lines.push(
      "",
      `Rules: the brand colour is used for headings, links and table headers with white text on them, so it must be dark: at least ${data.guidelines.minContrast}:1 against white, ideally ${data.guidelines.recommendedContrast}:1. Use the deepest usable shade of the brand's hue (navy, not bright blue). Body text is always near-black. Serif fonts suit long reading, sans fonts specs and memos.`,
    );
    return ok(lines.join("\n"), {
      ...summary(data),
      presets: data.presets,
      fonts: data.fonts,
      guidelines: data.guidelines,
    });
  },
});

export const updateExportTheme = defineTool({
  name: "update_export_theme",
  title: "Change the export theme",
  description:
    "Change the brand colour, font, preset, logo or footer used in every PDF and Word export in the workspace. It changes every export in the workspace; confirm: true records that the user agreed to the change. Prefer a preset; a custom colour must be dark, at least 4.5:1 against white (use a navy rather than a bright blue). The logo is set from an image URL (logo_url, or null to remove it) and only appears in exports with logo_in_exports: true. Colour, font, presets and logo work in every workspace; the footer only where get_export_theme says it can be changed. Owners and admins only. Afterwards offer to export one document with export_document as a preview.",
  scope: "workspace:admin",
  annotations: WRITE,
  input: z.object({
    preset: z.string().trim().min(1).max(40).optional().describe("A preset id from get_export_theme, like boardroom."),
    color: z
      .string()
      .trim()
      .regex(/^#?[0-9A-Fa-f]{6}$/)
      .optional()
      .describe("Brand colour as hex, like #13294B. Overrides the preset's colour."),
    font: z.string().trim().min(1).max(64).optional().describe("A font from get_export_theme. Overrides the preset's font."),
    logo_in_exports: z.boolean().optional(),
    footer: z
      .object({
        enabled: z.boolean().optional(),
        company_name: z.string().trim().max(120).nullable().optional().describe("Line 1; defaults to the workspace name."),
        tagline: z.string().trim().max(120).nullable().optional(),
        link_url: z.string().trim().max(2048).nullable().optional(),
        link_label: z.string().trim().max(120).nullable().optional(),
      })
      .optional()
      .describe("Only the fields given change. Only where get_export_theme says the footer can be changed."),
    logo_url: z
      .string()
      .trim()
      .url()
      .max(2048)
      .nullable()
      .optional()
      .describe("Public URL of a PNG, JPEG or WebP logo; null removes the logo."),
    allow_low_contrast: z.boolean().optional().describe("Save a colour below 4.5:1 anyway. Only if the user insists."),
    confirm: z.boolean().describe("true when the user agreed to this change."),
    workspace: workspaceArg,
  }),
  async run(args, ctx) {
    const footer = args.footer
      ? {
          ...(args.footer.enabled !== undefined ? { enabled: args.footer.enabled } : {}),
          ...(args.footer.company_name !== undefined ? { companyName: args.footer.company_name || null } : {}),
          ...(args.footer.tagline !== undefined ? { tagline: args.footer.tagline || null } : {}),
          ...(args.footer.link_url !== undefined ? { linkUrl: args.footer.link_url || null } : {}),
          ...(args.footer.link_label !== undefined ? { linkLabel: args.footer.link_label || null } : {}),
        }
      : undefined;
    const patch = {
      ...(args.preset ? { preset: args.preset } : {}),
      ...(args.color ? { brandColor: args.color.startsWith("#") ? args.color.toUpperCase() : `#${args.color.toUpperCase()}` } : {}),
      ...(args.font ? { font: args.font } : {}),
      ...(args.logo_in_exports !== undefined ? { showLogoInExports: args.logo_in_exports } : {}),
      ...(footer && Object.keys(footer).length > 0 ? { footer } : {}),
      ...(args.allow_low_contrast ? { allowLowContrast: true } : {}),
    };
    const changesBranding = Object.keys(patch).some((key) => key !== "allowLowContrast");
    if (!changesBranding && args.logo_url === undefined) {
      throw new UserFacingError(
        "Nothing to change. Pass preset, color, font, logo_in_exports, footer or logo_url (see get_export_theme).",
        "nothing_to_change",
      );
    }
    if (!args.confirm) {
      throw new UserFacingError(
        "This changes every PDF and Word export in the workspace. Show the user the proposed change, then call again with confirm: true after they agree.",
        "confirmation_required",
      );
    }

    const workspace = await ctx.resolveWorkspace(args.workspace);
    const before = await ctx.api.get<WorkspaceBranding>("/workspace/branding", { workspaceId: workspace.id });
    let after = before;
    // Colour, font, preset and footer first: if the API refuses them (low
    // contrast, plan), the logo isn't changed either.
    if (changesBranding) {
      after = await ctx.api.patch<WorkspaceBranding>("/workspace/branding", { workspaceId: workspace.id, ...patch });
    }
    if (args.logo_url !== undefined) {
      await ctx.api.post("/workspace/logo", { workspaceId: workspace.id, logoUrl: args.logo_url });
      after = await ctx.api.get<WorkspaceBranding>("/workspace/branding", { workspaceId: workspace.id });
    }

    const a = before.branding;
    const b = after.branding;
    // Field names for structuredContent, lines for the text.
    const changes: Array<[string, string]> = [];
    if (a.brandColor !== b.brandColor) changes.push(["brandColor", `- Brand colour: ${a.brandColor} → ${b.brandColor} (${contrastText(b.contrast)})`]);
    if (a.font !== b.font) changes.push(["font", `- Font: ${a.font} → ${b.font}`]);
    if (a.preset !== b.preset) changes.push(["preset", `- Preset: ${b.preset ?? "custom"}`]);
    if (a.logoUrl !== b.logoUrl || a.showLogoInExports !== b.showLogoInExports) changes.push(["logo", `- Logo: ${logoText(b)}`]);
    if (JSON.stringify(a.footer) !== JSON.stringify(b.footer)) changes.push(["footer", `- Footer: ${footerText(after)}`]);

    const lines =
      changes.length > 0
        ? [`Updated the export theme for ${after.workspace.name}:`, ...changes.map(([, line]) => line)]
        : [`The export theme for ${after.workspace.name} already had those settings:`, ...currentLines(after)];
    if (b.logoUrl && !b.showLogoInExports && args.logo_url) {
      lines.push("The logo only appears in exports with logo_in_exports: true.");
    }
    if (b.contrast.level !== "great") {
      lines.push(`Note: the brand colour is ${contrastText(b.contrast)}.`);
    }
    const nextStep = "Offer to export one document with export_document so the user can check the result.";
    lines.push(`This applies to every PDF and Word export in the workspace from now on. ${nextStep}`);
    return ok(lines.join("\n"), {
      ...summary(after),
      changed: changes.length > 0,
      changedFields: changes.map(([field]) => field),
      previous: { brandColor: a.brandColor, font: a.font, preset: a.preset },
      nextStep,
    });
  },
});

export const themeTools = [getExportTheme, updateExportTheme];
