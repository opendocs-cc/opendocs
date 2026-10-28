import { Router, type Response } from "express";
import { z } from "zod";

import {
  getWorkspaceBranding,
  updateWorkspaceBranding,
} from "@opendocs/shared/workspaces/branding";
import { instanceWebUrl } from "@opendocs/shared/config/instance";
import { requireAuth } from "../auth/middleware";
import { brandingSampleMarkdown } from "../lib/branding-sample";
import { convertMarkdown } from "../lib/converter";
import { getWorkspaceExportDefaultsMap, resolveExportBranding } from "../lib/export-branding";
import { exportRateLimit } from "../middleware/rate-limit";
import { validateBody } from "../middleware/validate";
import type { AuthenticatedRequest } from "../types";

/**
 * Export branding for agents: one read with everything needed to choose
 * (current settings, presets, fonts, contrast rules) and one write that
 * applies a preset and/or individual fields. Accepts API keys, unlike the
 * per-field routes the web settings page uses.
 */
const router = Router();

const ERRORS: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: "Workspace not found, or you're not a member of it." },
  forbidden: { status: 403, message: "Only workspace owners and admins can change branding." },
  plan_required: {
    status: 403,
    message:
      `A custom export footer is a Pro feature: Free exports keep the "Made with OpenDocs" footer. Brand color, font, presets and logo work on every plan. Upgrade at ${instanceWebUrl()}/dashboard/billing.`,
  },
  invalid_preset: { status: 400, message: "Unknown preset. Run `opendocs theme presets` to list them." },
  invalid_color: { status: 400, message: "Brand color must be a hex color like #13294B." },
  low_contrast: {
    status: 400,
    message:
      "That brand color is too light: headings would be hard to read and white table-header text would disappear. Pick a darker shade (at least 4.5:1 against white, ideally 7:1).",
  },
  invalid_font: { status: 400, message: "Unknown font. Run `opendocs theme fonts` to list them." },
  invalid_footer: { status: 400, message: "Invalid footer settings." },
  nothing_to_change: {
    status: 400,
    message: "Nothing to change. Pass a preset, brandColor, font, showLogoInExports or footer.",
  },
};

function sendServiceError(res: Response, result: { error: string } & Record<string, unknown>) {
  const known = ERRORS[result.error] ?? { status: 400, message: result.error };
  const message =
    result.error === "low_contrast"
      ? `${known.message} This one is ${result.contrast}:1.`
      : typeof result.message === "string"
        ? result.message
        : known.message;
  res.status(known.status).json({ ...result, message });
}

function isServiceError(result: unknown): result is { error: string } & Record<string, unknown> {
  return typeof (result as { error?: unknown }).error === "string";
}

router.get("/workspace/branding", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ error: "missing_workspace_id", message: "Pass ?workspaceId=." });
      return;
    }
    const result = await getWorkspaceBranding(userId, workspaceId);
    if (isServiceError(result)) {
      sendServiceError(res, result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const nullableText = z.string().trim().max(120).nullable().optional();
const updateBody = z
  .object({
    workspaceId: z.string().min(1),
    preset: z.string().trim().min(1).max(40).optional(),
    brandColor: z.string().trim().max(9).optional(),
    font: z.string().trim().min(1).max(64).optional(),
    showLogoInExports: z.boolean().optional(),
    footer: z
      .object({
        enabled: z.boolean().optional(),
        companyName: nullableText,
        tagline: nullableText,
        linkUrl: z.string().trim().max(2048).nullable().optional(),
        linkLabel: nullableText,
      })
      .optional(),
    allowLowContrast: z.boolean().optional(),
  })
  .strict();

router.patch("/workspace/branding", requireAuth, validateBody(updateBody), async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { workspaceId, ...input } = req.body as z.infer<typeof updateBody>;
    const result = await updateWorkspaceBranding(userId, workspaceId, input);
    if (isServiceError(result)) {
      sendServiceError(res, result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// A sample PDF with the workspace's saved export branding, so people can
// see their settings on a real document while they change them.
router.get("/workspace/branding/sample.pdf", requireAuth, exportRateLimit, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ error: "missing_workspace_id", message: "Pass ?workspaceId=." });
      return;
    }
    const branding = await getWorkspaceBranding(userId, workspaceId);
    if (isServiceError(branding)) {
      sendServiceError(res, branding);
      return;
    }
    const defaults = await getWorkspaceExportDefaultsMap([workspaceId]);
    const resolved = resolveExportBranding(defaults.get(workspaceId), {});
    const filename = `${branding.workspace.slug}-branding-sample`;
    const { buffer } = await convertMarkdown("pdf", {
      markdown: brandingSampleMarkdown(branding.workspace.name),
      filename,
      accent_color: resolved.accent_color,
      branding: resolved.branding,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
