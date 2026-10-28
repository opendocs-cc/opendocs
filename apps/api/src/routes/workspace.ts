import { Router } from "express";
import { z } from "zod";
import multer from "multer";

import { eq } from "drizzle-orm";

import { workspaces } from "@opendocs/shared/db/schema";
import { getDbOrThrow } from "@opendocs/shared/db/guards";
import {
  workspaceSlugSchema,
  normalizeWorkspaceSlug,
  isReservedWorkspaceSlug,
} from "@opendocs/shared/workspaces/validation";
import {
  getOnboardingState,
  getWorkspaceSettings,
  createWorkspace,
  updateWorkspaceName,
  updateAllowPublicDocuments,
  updateWorkspaceDefaultSort,
  updateWorkspaceBio,
  updateBrandColor,
  updateLogoUrl,
  updateShowLogoInExports,
  updateWorkspaceSlug,
  updateExportFont,
  updateExportFooter,
  deleteWorkspace,
  getTeamMembers,
  getTeamStats,
  getPendingInvitations,
  inviteTeamMember,
  resendInvitation,
  cancelInvitation,
  changeMemberRole,
  removeTeamMember,
  acceptInvitation,
  getUserWorkspaces,
  getEffectiveWorkspaceTier,
} from "@opendocs/shared/workspaces/service";
import {
  exportFontSchema,
  exportFooterSchema,
} from "@opendocs/shared/workspaces/validation";
import { POST_SORT_VALUES } from "@opendocs/shared/posts";
import { createSlug } from "@opendocs/shared/posts/slug";
import { ensureDefaultProjectForWorkspace } from "@opendocs/shared/projects/service";
import {
  uploadObject,
  storageKeys,
  extForMime,
  isImageMime,
  isStorageConfigured,
  StorageError,
} from "@opendocs/shared/storage/r2";
import { instanceWebUrl } from "@opendocs/shared/config/instance";
import { requireAuth, requireSessionAuth } from "../auth/middleware";
import { singleFileUpload } from "../middleware/upload";
import { validateBody } from "../middleware/validate";
import type { AuthenticatedRequest } from "../types";

// 2 MB cap matches what the dashboard uploader enforces client-side.
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const router = Router();

// 403 gate for the export footer, the one Pro-only part of export
// branding: Free exports always carry the "Made with OpenDocs" footer.
// Font, brand color, presets and logo-in-exports are open to every plan.
// Mirrors the "Pro" badge + upgrade modal on the client.
async function assertPaidTier(
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; status: number; body: unknown }> {
  const tier = await getEffectiveWorkspaceTier(workspaceId);
  if (tier === "pro" || tier === "team") return { ok: true };
  return {
    ok: false,
    status: 403,
    body: { error: "plan_required", tier: tier ?? "free" },
  };
}

const updateNameSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(2).max(120),
});

const deleteWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
  confirmSlug: z.string().min(1),
});

const publicDocsSchema = z.object({
  workspaceId: z.string().min(1),
  allowed: z.boolean(),
});

// Validates against the canonical post-sort enum so a typo or stale
// client never lands in the DB. Mirrors the runtime check inside
// `updateWorkspaceDefaultSort` for a defence-in-depth pair.
const defaultSortSchema = z.object({
  workspaceId: z.string().min(1),
  value: z.enum(POST_SORT_VALUES),
});

// GET /api/v1/workspace?workspaceId=...
// Optional `workspaceId` query scopes the read to a specific workspace —
// without it we fall back to the caller's earliest-joined membership, the
// same workspace the CLI picks at login.
router.get("/workspace", requireSessionAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workspaceId = req.query.workspaceId as string | undefined;
    const settings = await getWorkspaceSettings(userId, workspaceId);
    res.json({ workspace: settings });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/workspace
router.post(
  "/workspace",
  requireSessionAuth,
  validateBody(updateNameSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await updateWorkspaceName(
        userId,
        req.body.workspaceId,
        req.body.name,
      );

      if (!result) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/workspace
router.delete(
  "/workspace",
  requireSessionAuth,
  validateBody(deleteWorkspaceSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await deleteWorkspace(
        userId,
        req.body.workspaceId,
        req.body.confirmSlug,
      );

      if ("error" in result) {
        const statusMap: Record<string, number> = {
          not_found: 404,
          forbidden: 403,
          confirmation_mismatch: 400,
          last_workspace: 409,
        };
        res.status(statusMap[result.error] ?? 400).json(result);
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/workspaces/current
router.get("/workspaces/current", requireSessionAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const onboarding = await getOnboardingState(userId);
    res.json({ workspace: onboarding.workspace });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/workspaces
// Lists every workspace the caller is an active member of. Used by the CLI
// workspace switcher and the dashboard's workspace picker. Dual auth so
// API-key clients (CLI, agents) can hit it alongside session clients.
router.get("/workspaces", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const rows = await getUserWorkspaces(userId);
    res.json({
      workspaces: rows.map((r) => ({
        id: r.workspaceId,
        name: r.name,
        slug: r.slug,
        role: r.role,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/workspaces — create a workspace (CLI: `opendocs workspace
// create`). Plan limits and slug rules are enforced by createWorkspace.
const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(3).max(32).optional(),
});

router.post(
  "/workspaces",
  requireAuth,
  validateBody(createWorkspaceSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const body = req.body as z.infer<typeof createWorkspaceSchema>;
      const slug = body.slug ?? createSlug(body.name).slice(0, 32).replace(/-+$/, "");
      const result = await createWorkspace(userId, body.name, slug);
      if ("error" in result) {
        const status: Record<string, number> = {
          invalid_slug: 400,
          reserved_slug: 400,
          slug_taken: 409,
          plan_limit: 403,
        };
        const messages: Record<string, string> = {
          reserved_slug: `"${slug}" is reserved. Pass --slug with another workspace ID.`,
          slug_taken: `The workspace ID "${slug}" is taken. Pass --slug with another one.`,
          plan_limit: `Your plan's workspace limit is reached. Upgrade at ${instanceWebUrl()}/dashboard/billing.`,
        };
        res.status(status[result.error] ?? 400).json({
          ...result,
          message: "message" in result ? result.message : messages[result.error],
        });
        return;
      }
      const defaultProject = await ensureDefaultProjectForWorkspace(result.workspace.id);
      res.status(201).json({
        workspace: { ...result.workspace, role: "owner" },
        defaultProject,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/workspace/check-slug?slug=...
// Quick availability check for the workspace slug picker during onboarding.
// Validates format, checks reserved words, and checks DB uniqueness.
router.get("/workspace/check-slug", requireSessionAuth, async (req, res, next) => {
  try {
    const raw = (req.query.slug as string || "").trim();
    if (!raw) {
      res.json({ available: false, reason: "Workspace ID is required." });
      return;
    }

    const normalized = normalizeWorkspaceSlug(raw);
    const parsed = workspaceSlugSchema.safeParse(normalized);
    if (!parsed.success) {
      res.json({
        available: false,
        reason: parsed.error.issues[0]?.message ?? "Invalid workspace ID.",
      });
      return;
    }

    if (isReservedWorkspaceSlug(normalized)) {
      res.json({ available: false, reason: "That workspace ID is reserved." });
      return;
    }

    const db = getDbOrThrow();
    const [existing] = await db
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.slug, normalized))
      .limit(1);

    if (existing) {
      res.json({ available: false, reason: "That workspace ID is already taken." });
      return;
    }

    res.json({ available: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/workspace/slug
// Rename the workspace slug. Admin/owner only. All existing post URLs
// under /{oldSlug}/… stop resolving; the UI surfaces this with a warning
// dialog before invoking.
const updateSlugSchema = z.object({
  workspaceId: z.string().min(1),
  slug: z.string().min(3).max(32),
});

router.post(
  "/workspace/slug",
  requireSessionAuth,
  validateBody(updateSlugSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await updateWorkspaceSlug(
        userId,
        req.body.workspaceId,
        req.body.slug,
      );

      if ("error" in result) {
        const statusMap: Record<string, number> = {
          forbidden: 403,
          invalid_slug: 400,
          reserved_slug: 400,
          slug_taken: 409,
          unchanged: 200,
          not_found: 404,
        };
        // `unchanged` isn't an error from the user's point of view — the
        // field already holds the value they asked for. Reply 200 with
        // the current slug so the UI treats it as a successful no-op.
        if (result.error === "unchanged") {
          res.json({
            slug: normalizeWorkspaceSlug(req.body.slug),
            unchanged: true,
          });
          return;
        }
        res
          .status(statusMap[result.error] ?? 400)
          .json({ error: result.error, message: result.message });
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/workspace/export-font
router.post(
  "/workspace/export-font",
  requireSessionAuth,
  validateBody(
    z.object({
      workspaceId: z.string().min(1),
      font: exportFontSchema.nullable(),
    }),
  ),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const workspaceId = req.body.workspaceId as string;

      const result = await updateExportFont(userId, workspaceId, req.body.font);

      if (result && "error" in result) {
        const statusMap: Record<string, number> = {
          forbidden: 403,
          invalid_font: 400,
        };
        res.status(statusMap[result.error] ?? 400).json(result);
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/workspace/export-footer
const exportFooterRouteSchema = exportFooterSchema.extend({
  workspaceId: z.string().min(1),
});

router.post(
  "/workspace/export-footer",
  requireSessionAuth,
  validateBody(exportFooterRouteSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { workspaceId, ...footer } = req.body as z.infer<
        typeof exportFooterRouteSchema
      >;

      const gate = await assertPaidTier(workspaceId);
      if (!gate.ok) {
        res.status(gate.status).json(gate.body);
        return;
      }

      const result = await updateExportFooter(userId, workspaceId, footer);

      if ("error" in result) {
        const statusMap: Record<string, number> = {
          forbidden: 403,
          invalid_input: 400,
        };
        res.status(statusMap[result.error] ?? 400).json(result);
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/workspace/public-documents
router.post(
  "/workspace/public-documents",
  requireSessionAuth,
  validateBody(publicDocsSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await updateAllowPublicDocuments(
        userId,
        req.body.workspaceId,
        req.body.allowed,
      );

      if (!result) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/workspace/default-sort — owner-only endpoint that
// updates the workspace's default article ordering. The same value
// then flows back through `getWorkspaceSettings` (so the form
// reflects it on next load) and `getProfileByWorkspaceSlugFromDb`
// (so the public profile picks it up as the cascade fallback).
router.post(
  "/workspace/default-sort",
  requireSessionAuth,
  validateBody(defaultSortSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await updateWorkspaceDefaultSort(
        userId,
        req.body.workspaceId,
        req.body.value,
      );

      if (!result) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/workspace/bio
const bioSchema = z.object({
  workspaceId: z.string().min(1),
  bio: z.string().max(500).nullable(),
});

router.post(
  "/workspace/bio",
  requireSessionAuth,
  validateBody(bioSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await updateWorkspaceBio(
        userId,
        req.body.workspaceId,
        req.body.bio,
      );

      if (!result) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/workspace/brand-color
const brandColorSchema = z.object({
  workspaceId: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
});

router.post(
  "/workspace/brand-color",
  requireSessionAuth,
  validateBody(brandColorSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const workspaceId = req.body.workspaceId as string;

      const result = await updateBrandColor(userId, workspaceId, req.body.color);

      if (!result) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/workspace/logo
const logoUrlSchema = z.object({
  workspaceId: z.string().min(1),
  logoUrl: z.string().url().nullable(),
});

router.post(
  "/workspace/logo",
  requireAuth,
  validateBody(logoUrlSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await updateLogoUrl(
        userId,
        req.body.workspaceId,
        req.body.logoUrl,
      );

      if (!result) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/workspace/logo/upload
// Multipart upload. Uploads to R2, then writes the public URL via
// updateLogoUrl which enforces admin/owner role. Members get 403.
router.post(
  "/workspace/logo/upload",
  requireAuth,
  singleFileUpload(logoUpload, "file", { tooLarge: "Logo must be 2 MB or smaller." }),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;

      const workspaceId =
        typeof req.body?.workspaceId === "string" ? req.body.workspaceId : "";
      if (!workspaceId) {
        res.status(400).json({ error: "missing_workspace_id" });
        return;
      }

      const workspace = await getWorkspaceSettings(userId, workspaceId);
      if (!workspace || workspace.role === "member") {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      if (!isStorageConfigured()) {
        res.status(503).json({ error: "storage_not_configured" });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "missing_file" });
        return;
      }

      if (!isImageMime(file.mimetype)) {
        res.status(400).json({
          error: "unsupported_mime",
          message: "Logo must be JPEG, PNG, WebP, GIF, or SVG.",
        });
        return;
      }

      const ext = extForMime(file.mimetype);
      const key = storageKeys.workspaceLogo(workspaceId, ext);

      const { url } = await uploadObject({
        key,
        body: file.buffer,
        contentType: file.mimetype,
      });

      const result = await updateLogoUrl(userId, workspaceId, url);
      if (!result) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      res.json({ logoUrl: url, workspace: result });
    } catch (err) {
      if (err instanceof StorageError) {
        res.status(err.status).json({ error: err.code, message: err.message });
        return;
      }
      next(err);
    }
  },
);

// POST /api/v1/workspace/logo-in-exports
const logoExportsSchema = z.object({
  workspaceId: z.string().min(1),
  show: z.boolean(),
});

router.post(
  "/workspace/logo-in-exports",
  requireSessionAuth,
  validateBody(logoExportsSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const workspaceId = req.body.workspaceId as string;

      const result = await updateShowLogoInExports(
        userId,
        workspaceId,
        req.body.show,
      );

      if (!result) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Team management
// ---------------------------------------------------------------------------

const inviteMemberSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "member"]),
  workspaceId: z.string().uuid(),
});

const changeMemberRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

// Shared query-string reader for the team GETs — keeps coercion identical
// across routes. `workspaceId` is required on all three: inferring "which
// workspace" from `(userId).limit(1)` picked an arbitrary membership for
// multi-workspace users and silently showed the wrong team.
function readWorkspaceIdQuery(req: {
  query: Record<string, unknown>;
}): string | undefined {
  const raw = req.query.workspaceId;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return raw;
}

// GET /api/v1/workspace/team
router.get("/workspace/team", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workspaceId = readWorkspaceIdQuery(req);
    if (!workspaceId) {
      res.status(400).json({ error: "missing_workspace_id" });
      return;
    }
    const members = await getTeamMembers(userId, workspaceId);

    if (!members) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    res.json({ members });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/workspace/team/stats
router.get("/workspace/team/stats", requireSessionAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workspaceId = readWorkspaceIdQuery(req);
    if (!workspaceId) {
      res.status(400).json({ error: "missing_workspace_id" });
      return;
    }
    const stats = await getTeamStats(userId, workspaceId);

    if (!stats) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/workspace/team/invitations
router.get("/workspace/team/invitations", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workspaceId = readWorkspaceIdQuery(req);
    if (!workspaceId) {
      res.status(400).json({ error: "missing_workspace_id" });
      return;
    }
    const invitations = await getPendingInvitations(userId, workspaceId);

    if (!invitations) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    res.json({ invitations });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/workspace/team/invite
// Dual auth so agents can run `opendocs invite sam@acme.com`.
router.post(
  "/workspace/team/invite",
  requireAuth,
  validateBody(inviteMemberSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await inviteTeamMember(userId, req.body.email, req.body.role, req.body.workspaceId);

      if ("error" in result) {
        const statusMap: Record<string, number> = {
          forbidden: 403,
          already_member: 409,
          already_invited: 409,
          invite_limit: 400,
          member_limit: 403,
        };
        res.status(statusMap[result.error as string] ?? 400).json(result);
        return;
      }

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/workspace/team/invitations/:id/resend
router.post(
  "/workspace/team/invitations/:id/resend",
  requireAuth,
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await resendInvitation(userId, req.params.id as string);

      if ("error" in result) {
        const statusMap: Record<string, number> = { forbidden: 403, not_found: 404 };
        res.status(statusMap[result.error as string] ?? 400).json({ error: result.error });
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/workspace/team/invitations/:id
router.delete(
  "/workspace/team/invitations/:id",
  requireAuth,
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await cancelInvitation(userId, req.params.id as string);

      if ("error" in result) {
        const statusMap: Record<string, number> = { forbidden: 403, not_found: 404 };
        res.status(statusMap[result.error as string] ?? 400).json({ error: result.error });
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/workspace/team/members/:id/role
router.patch(
  "/workspace/team/members/:id/role",
  requireAuth,
  validateBody(changeMemberRoleSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await changeMemberRole(userId, req.params.id as string, req.body.role);

      if ("error" in result) {
        const statusMap: Record<string, number> = { forbidden: 403, not_found: 404 };
        res.status(statusMap[result.error as string] ?? 400).json({ error: result.error });
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/workspace/team/members/:id
router.delete(
  "/workspace/team/members/:id",
  requireAuth,
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await removeTeamMember(userId, req.params.id as string);

      if ("error" in result) {
        const statusMap: Record<string, number> = { forbidden: 403, not_found: 404 };
        res.status(statusMap[result.error as string] ?? 400).json({ error: result.error });
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/workspace/team/accept-invite
router.post(
  "/workspace/team/accept-invite",
  requireAuth,
  validateBody(acceptInviteSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await acceptInvitation(userId, req.body.token);

      if ("error" in result) {
        const statusMap: Record<string, number> = {
          not_found: 404,
          expired: 410,
          already_member: 409,
          forbidden: 403,
          billing_failed: 402,
          member_limit: 403,
        };
        res.status(statusMap[result.error as string] ?? 400).json(result);
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
