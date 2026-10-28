import { Router } from "express";
import { z } from "zod";
import JSZip from "jszip";

import { eq, and, or, desc, sql, inArray, ilike } from "drizzle-orm";

import {
  publishInputSchema,
  updatePostInputSchema,
  visibilitySchema,
  patchTagsSchema,
  batchExportInputSchema,
  movePostInputSchema,
  sharePostInputSchema,
  unsharePostInputSchema,
  type BatchExportInput,
} from "@opendocs/shared/posts/validation";
import {
  updatePostForUser,
  PostPermissionError,
  unpublishPost,
  changeWorkspacePostVisibilityForUser,
  deleteWorkspacePostForUser,
  getTagsForPostIds,
  getTagsForPost,
  patchPostTags,
  movePostToProject,
  VersionConflictError,
} from "@opendocs/shared/posts/service";
import {
  getPostVersionMarkdown,
  listPostVersions,
  restorePostVersion,
} from "@opendocs/shared/posts/versions";
import {
  addPostShares,
  listPostShares,
  removePostShares,
} from "@opendocs/shared/posts/sharing";
import {
  canViewerAccessPost,
  canUserDownloadPost,
  getManagedWorkspaceIds,
  getViewerWorkspaceIds,
  getEffectiveWorkspaceTier,
} from "@opendocs/shared/workspaces/service";
import { normalizeWorkspaceSlug } from "@opendocs/shared/workspaces/validation";
import { instanceWebUrl } from "@opendocs/shared/config/instance";
import { customDomainViewerAuth, getCustomDomainViewer } from "../middleware/custom-domain-viewer";
import { stripPrivateBlocks } from "@opendocs/shared/markdown/private-blocks";
import { getDbOrThrow } from "@opendocs/shared/db/guards";
import { posts, postTags, postVersions, projects, workspaces } from "@opendocs/shared/db/schema";
import { postUrlPath } from "@opendocs/shared/projects/service";
import { optionalAuth, requireAuth } from "../auth/middleware";
import { invalidRequestBody, validateBody } from "../middleware/validate";
import { readClient } from "../middleware/client";
import {
  exportRateLimit,
  batchExportRateLimit,
  exportConcurrencyLimit,
  publicExportRateLimit,
  publicRawRateLimit,
  workspaceZipRateLimit,
} from "../middleware/rate-limit";
import {
  attachmentHeader,
  convertMarkdown,
  converterFailure,
  type ConvertFormat,
} from "../lib/converter";
import {
  getWorkspaceExportDefaultsMap,
  resolveExportBranding,
} from "../lib/export-branding";
import {
  getCachedExport,
  storeCachedExport,
  isExportCacheEnabled,
} from "../lib/export-cache";
import {
  findAccessiblePost,
  findSlugInOtherWorkspace,
  isUuid,
  type AccessiblePost,
} from "../lib/post-lookup";
import { withPublicUrl, withPublicUrls } from "../lib/public-url";
import type { AuthenticatedRequest } from "../types";

// The path param on every /posts/:postId route is "postId OR slug" — the
// CLI accepts either so users don't have to copy the UUID around.
// `findAccessiblePost` (lib/post-lookup.ts) resolves both to a document the
// caller can read; the services then check what they may change.

/**
 * Word export and caller branding overrides (footer and the like) are
 * paid features of the workspace (keyed on the workspace's plan, like
 * the public download route). Free workspaces get PDF only, with their own
 * color, font and logo and the "Made with OpenDocs" footer.
 */
export async function isPaidWorkspace(workspaceId: string): Promise<boolean> {
  const tier = await getEffectiveWorkspaceTier(workspaceId);
  return tier !== null && tier !== "free";
}

export const DOCX_REQUIRES_PRO = {
  error: "docx_requires_pro",
  message:
    `Word export is part of the Pro and Team plans. Export as PDF instead, or upgrade at ${instanceWebUrl()}/dashboard/billing.`,
};

// Every `/posts/:postId` route reads the optional `workspaceId` query
// parameter the same way. Centralised so callers don't drift on coercion
// (always return a string, normalise empty string to undefined).
function readWorkspaceId(req: {
  query: Record<string, unknown>;
}): string | undefined {
  const raw = req.query.workspaceId;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return raw;
}

function readProjectId(req: {
  query: Record<string, unknown>;
}): string | undefined {
  const raw = req.query.projectId;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return raw;
}

// Build the 404 body. If the miss is on a slug that the caller scoped to a
// specific workspace, and the slug exists in another workspace the user
// has authored in, surface the hint so the CLI can prompt the user to
// switch workspaces. UUIDs never need the hint — they're globally unique,
// so a miss is authoritative.
async function buildNotFoundBody(
  userId: string,
  postIdOrSlug: string,
  workspaceId: string | undefined,
): Promise<{ error: "not_found"; message?: string }> {
  if (!workspaceId || isUuid(postIdOrSlug)) {
    return { error: "not_found" };
  }
  const otherWsSlug = await findSlugInOtherWorkspace(
    userId,
    postIdOrSlug,
    workspaceId,
  );
  if (!otherWsSlug) return { error: "not_found" };
  return {
    error: "not_found",
    message: `"${postIdOrSlug}" exists in workspace "${otherWsSlug}" — run \`opendocs workspace use ${otherWsSlug}\` first, or pass an explicit post ID.`,
  };
}

const router = Router();

router.get("/posts", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 20, 1), 100);
    const page = Math.max(parseInt(String(req.query.page)) || 1, 1);
    const offset = (page - 1) * limit;
    const tagFilter = req.query.tag ? String(req.query.tag).toLowerCase() : null;
    // Optional workspace scoping. The CLI passes this by default so that
    // `opendocs list` reflects the active workspace; `--all` omits it to
    // return every workspace the user has authored in. `authorUserId` is
    // still required, so an unknown/non-member workspaceId just returns
    // an empty page — no separate membership check needed.
    const workspaceFilter = req.query.workspaceId
      ? String(req.query.workspaceId)
      : null;
    const projectFilter = req.query.projectId
      ? String(req.query.projectId)
      : null;
    // Free-text search over title and summary ("find the Acme NDA"), used
    // by the MCP list_documents tool. Case-insensitive substring match.
    const searchFilter =
      typeof req.query.q === "string" && req.query.q.trim()
        ? req.query.q.trim().slice(0, 200)
        : null;

    const db = getDbOrThrow();

    const [membershipWorkspaceIds, managedWorkspaceIds] = await Promise.all([
      getViewerWorkspaceIds(userId),
      getManagedWorkspaceIds(userId),
    ]);
    // Your own documents in any state; teammates' workspace and public ones
    // while published. Unpublished documents are offline, so teammates'
    // only show up for owners and admins, who can still delete them.
    const accessClauses = [eq(posts.authorUserId, userId)];
    if (membershipWorkspaceIds.length > 0) {
      accessClauses.push(
        and(
          inArray(posts.workspaceId, membershipWorkspaceIds),
          inArray(posts.visibility, ["workspace", "public"]),
          managedWorkspaceIds.length > 0
            ? or(eq(posts.isPublished, true), inArray(posts.workspaceId, managedWorkspaceIds))
            : eq(posts.isPublished, true),
        )!,
      );
    }
    const clauses = [or(...accessClauses)!];
    if (workspaceFilter) {
      clauses.push(eq(posts.workspaceId, workspaceFilter));
    }
    if (projectFilter) {
      clauses.push(eq(posts.projectId, projectFilter));
    }
    if (tagFilter) {
      clauses.push(
        sql`EXISTS (SELECT 1 FROM post_tags pt WHERE pt.post_id = ${posts.id} AND pt.tag = ${tagFilter})`,
      );
    }
    if (searchFilter) {
      const pattern = `%${searchFilter.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      clauses.push(or(ilike(posts.title, pattern), ilike(posts.summary, pattern))!);
    }
    const baseWhere = and(...clauses);

    const [postRecords, countResult] = await Promise.all([
      db
        .select({
          id: posts.id,
          slug: posts.slug,
          title: posts.title,
          summary: posts.summary,
          visibility: posts.visibility,
          isPublished: posts.isPublished,
          updatedAt: posts.updatedAt,
          workspaceId: posts.workspaceId,
          // Join only exists to surface the workspace slug on each post so
          // CLI/`--all` callers can group by workspace without a second
          // lookup. Posts always have a workspaceId (NOT NULL) so innerJoin
          // is safe.
          workspaceSlug: workspaces.slug,
          projectId: projects.id,
          projectSlug: projects.slug,
          projectName: projects.name,
          isDefaultProject: projects.isDefault,
          // Lets `opendocs status` spot remote changes without one request
          // per document.
          versionNumber: postVersions.versionNumber,
        })
        .from(posts)
        .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
        .innerJoin(projects, eq(posts.projectId, projects.id))
        .leftJoin(postVersions, eq(posts.currentVersionId, postVersions.id))
        .where(baseWhere)
        .orderBy(desc(posts.updatedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(posts)
        .where(baseWhere),
    ]);

    const total = countResult[0]?.count ?? 0;

    const tagsMap = await getTagsForPostIds(postRecords.map((p) => p.id));

    res.json({
      posts: await withPublicUrls(
        postRecords.map((p) => ({
          ...p,
          url: postUrlPath(p.workspaceSlug, { slug: p.projectSlug, isDefault: p.isDefaultProject }, p.slug),
          tags: tagsMap.get(p.id) ?? [],
        })),
        (p) => p.id,
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/posts/:postId", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const postIdOrSlug = req.params.postId as string;
    const workspaceId = readWorkspaceId(req);
    const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, readProjectId(req));
    const db = getDbOrThrow();

    const [result] = post
      ? await db
          .select({
            id: posts.id,
            slug: posts.slug,
            title: posts.title,
            summary: posts.summary,
            visibility: posts.visibility,
            isPublished: posts.isPublished,
            publishedAt: posts.publishedAt,
            updatedAt: posts.updatedAt,
            workspaceId: posts.workspaceId,
            workspaceSlug: workspaces.slug,
            projectId: projects.id,
            projectSlug: projects.slug,
            projectName: projects.name,
            isDefaultProject: projects.isDefault,
            versionNumber: postVersions.versionNumber,
            versionId: postVersions.id,
            versionCreatedAt: postVersions.createdAt,
          })
          .from(posts)
          .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
          .innerJoin(projects, eq(posts.projectId, projects.id))
          .innerJoin(postVersions, eq(posts.currentVersionId, postVersions.id))
          .where(eq(posts.id, post.id))
          .limit(1)
      : [];

    if (!result) {
      res.status(404).json(
        await buildNotFoundBody(userId, postIdOrSlug, workspaceId),
      );
      return;
    }

    const tags = await getTagsForPost(result.id);

    res.json({
      post: await withPublicUrl(result.id, {
        id: result.id,
        slug: result.slug,
        title: result.title,
        summary: result.summary,
        visibility: result.visibility,
        isPublished: result.isPublished,
        publishedAt: result.publishedAt,
        updatedAt: result.updatedAt,
        url: postUrlPath(
          result.workspaceSlug,
          { slug: result.projectSlug, isDefault: result.isDefaultProject },
          result.slug,
        ),
        workspaceId: result.workspaceId,
        workspaceSlug: result.workspaceSlug,
        projectId: result.projectId,
        projectSlug: result.projectSlug,
        projectName: result.projectName,
        isDefaultProject: result.isDefaultProject,
        versionNumber: result.versionNumber,
        versionId: result.versionId,
        versionCreatedAt: result.versionCreatedAt,
        tags,
      }),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/posts/:postId/raw", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const postIdOrSlug = req.params.postId as string;
    const workspaceId = readWorkspaceId(req);
    const projectId = readProjectId(req);
    const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, projectId);
    const db = getDbOrThrow();

    const [result] = post
      ? await db
          .select({
            id: posts.id,
            title: posts.title,
            slug: posts.slug,
            projectId: projects.id,
            projectSlug: projects.slug,
            projectName: projects.name,
            isDefaultProject: projects.isDefault,
            rawMarkdown: postVersions.rawMarkdown,
            versionNumber: postVersions.versionNumber,
          })
          .from(posts)
          .innerJoin(projects, eq(posts.projectId, projects.id))
          .innerJoin(postVersions, eq(posts.currentVersionId, postVersions.id))
          .where(eq(posts.id, post.id))
          .limit(1)
      : [];

    if (!post || !result) {
      res.status(404).json(
        await buildNotFoundBody(userId, postIdOrSlug, workspaceId),
      );
      return;
    }

    res.json({
      postId: result.id,
      // Members and the author get the full source to edit; guests and
      // public readers get what the page shows, without ```private notes.
      markdown: post.viewerIsMember
        ? result.rawMarkdown
        : stripPrivateBlocks(result.rawMarkdown),
      title: result.title,
      slug: result.slug,
      projectId: result.projectId,
      projectSlug: result.projectSlug,
      projectName: result.projectName,
      isDefaultProject: result.isDefaultProject,
      versionNumber: result.versionNumber,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/posts/:postId/update", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const postIdOrSlug = req.params.postId as string;
    const workspaceId = readWorkspaceId(req);
    const projectId = readProjectId(req);

    const parsed = updatePostInputSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json(invalidRequestBody(parsed.error));
      return;
    }

    const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, projectId);
    if (!post) {
      res.status(404).json(
        await buildNotFoundBody(userId, postIdOrSlug, workspaceId),
      );
      return;
    }

    const result = await updatePostForUser(userId, post.id, parsed.data, {
      client: readClient(req),
    });
    res.json(await withPublicUrl(result.postId, result));
  } catch (err) {
    if (err instanceof VersionConflictError) {
      res.status(409).json({
        error: err.code,
        message: err.message,
        currentVersionNumber: err.currentVersionNumber,
        baseVersionNumber: err.baseVersionNumber,
        currentVersionCreatedAt: err.currentVersionCreatedAt,
      });
      return;
    }
    if (err instanceof Error) {
      sendManageError(res, err, {
        error: "update_failed",
        message: "Unable to update document.",
      });
      return;
    }
    next(err);
  }
});

router.post("/posts/:postId/unpublish", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const postIdOrSlug = req.params.postId as string;
    const workspaceId = readWorkspaceId(req);
    const projectId = readProjectId(req);

    const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, projectId);
    if (!post) {
      res.status(404).json(
        await buildNotFoundBody(userId, postIdOrSlug, workspaceId),
      );
      return;
    }

    const result = await unpublishPost(userId, post.id);
    res.json(result);
  } catch (err) {
    if (err instanceof Error) {
      sendManageError(res, err, {
        error: "unpublish_failed",
        message: "Unable to unpublish document.",
      });
      return;
    }
    next(err);
  }
});

// Hard-delete a post. Distinct from /unpublish (which only toggles
// isPublished = false and keeps the row). The author, owners and admins
// may delete. `deleteWorkspacePostForUser` runs its own transaction:
// nulls the circular currentVersionId FK, deletes postTags +
// postVersions, deletes the post, writes an audit event.
// Returns { postId, deleted: true, slug } — the slug is echoed so
// callers can surface "your 'my-report' slug is now free to reuse".
router.delete("/posts/:postId", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const postIdOrSlug = req.params.postId as string;
    const workspaceId = readWorkspaceId(req);
    const projectId = readProjectId(req);

    const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, projectId);
    if (!post) {
      res
        .status(404)
        .json(await buildNotFoundBody(userId, postIdOrSlug, workspaceId));
      return;
    }

    const result = await deleteWorkspacePostForUser(userId, post.id);
    res.json(result);
  } catch (err) {
    if (err instanceof Error) {
      sendManageError(res, err, {
        error: "delete_failed",
        message: "Unable to delete document.",
      });
      return;
    }
    next(err);
  }
});

router.post("/posts/:postId/visibility", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const postIdOrSlug = req.params.postId as string;
    const workspaceId = readWorkspaceId(req);
    const projectId = readProjectId(req);

    const parsed = visibilitySchema.safeParse(req.body?.visibility);

    if (!parsed.success) {
      res.status(400).json({ error: "invalid_visibility" });
      return;
    }

    const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, projectId);
    if (!post) {
      res.status(404).json(
        await buildNotFoundBody(userId, postIdOrSlug, workspaceId),
      );
      return;
    }

    const result = await changeWorkspacePostVisibilityForUser(
      userId,
      post.id,
      parsed.data,
      req.body?.confirmPublic,
    );

    res.json(await withPublicUrl(result.postId, result));
  } catch (err) {
    if (err instanceof Error) {
      sendManageError(res, err, {
        error: "visibility_change_failed",
        message: "Unable to change document visibility.",
      });
      return;
    }
    next(err);
  }
});

router.patch(
  "/posts/:postId/tags",
  requireAuth,
  validateBody(patchTagsSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const postIdOrSlug = req.params.postId as string;
      const workspaceId = readWorkspaceId(req);
      const projectId = readProjectId(req);
      const { add, remove } = req.body;

      const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, projectId);
      if (!post) {
        res.status(404).json(
          await buildNotFoundBody(userId, postIdOrSlug, workspaceId),
        );
        return;
      }

      const tags = await patchPostTags(userId, post.id, add ?? [], remove ?? []);
      res.json({ postId: post.id, tags });
    } catch (err) {
      if (err instanceof Error) {
        sendManageError(res, err, {
          error: "tag_update_failed",
          message: "Unable to update tags.",
        });
        return;
      }
      next(err);
    }
  },
);

// Export a post as a rendered .docx or .pdf. The heavy lifting happens in the
// doc-converter microservice (see src/lib/converter.ts); this handler wraps it
// with auth, rate-limiting, and the same access check used by /raw.
export const exportBodySchema = z.object({
  filename: z.string().trim().min(1).max(120).optional(),
  landscape: z.boolean().optional(),
  accent_color: z.string().regex(/^#?[0-9A-Fa-f]{6}$/).optional(),
  // Pass-through — the converter validates the inner shape against its own
  // BrandingConfig Pydantic model and returns a clean error if anything is off.
  branding: z.record(z.string(), z.unknown()).optional(),
});

// Batch export — convert up to MAX_BATCH_SIZE posts in a single request and
// stream back as one zip. Each successful conversion lands at `<slug>.<ext>`
// inside the zip, and a `manifest.json` at the root carries per-doc results
// (including failures). The same manifest is base64-encoded into the
// `X-Batch-Manifest` response header so a client can read results without
// having to unzip first.
//
// Routed BEFORE the parameterized /posts/:postId/export/:format path so
// Express matches `/posts/batch/export` before treating "batch" as a postId.
router.post(
  "/posts/batch/export",
  requireAuth,
  batchExportRateLimit,
  exportConcurrencyLimit,
  validateBody(batchExportInputSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { postIds, format, landscape, accent_color, branding, workspaceId, projectId } =
        req.body as BatchExportInput;

      // Inputs can be UUIDs or slugs (the CLI hands whichever the user typed
      // to the API verbatim). Each resolves like the single-document routes
      // (`findAccessiblePost`): any document the caller can read, slugs
      // scoped to the workspace/project the CLI sends and never another
      // tenant's. At most MAX_BATCH_SIZE lookups, so one per input is fine.
      const found = new Map<string, AccessiblePost>();
      for (const input of new Set(postIds)) {
        const post = await findAccessiblePost(userId, input, workspaceId, projectId);
        if (post) found.set(input, post);
      }

      const db = getDbOrThrow();
      const foundIds = [...new Set([...found.values()].map((post) => post.id))];
      const rows = foundIds.length === 0
        ? []
        : await db
            .select({
              id: posts.id,
              slug: posts.slug,
              workspaceId: posts.workspaceId,
              rawMarkdown: postVersions.rawMarkdown,
            })
            .from(posts)
            .innerJoin(postVersions, eq(posts.currentVersionId, postVersions.id))
            .where(inArray(posts.id, foundIds));

      const rowById = new Map(rows.map((row) => [row.id, row]));
      const rowByInput = new Map<string, typeof rows[number]>();
      for (const [input, post] of found) {
        const row = rowById.get(post.id);
        if (row) rowByInput.set(input, row);
      }

      // Pre-fetch workspace branding defaults for every distinct workspace in
      // this batch — one query for the whole batch regardless of how many
      // posts it touches. The per-post loop below just reads from this map.
      const wsDefaults = await getWorkspaceExportDefaultsMap(
        rows.map((r) => r.workspaceId),
      );

      type BatchExportResult =
        | {
            postId: string;
            success: true;
            slug: string;
            filename: string;
            bytes: number;
            cached: boolean;
          }
        | {
            postId: string;
            success: false;
            error: string;
            message: string;
          };

      const zip = new JSZip();
      const results: BatchExportResult[] = [];
      const paidByWorkspace = new Map<string, boolean>();
      let cacheHits = 0;
      let cacheMisses = 0;

      // Sequential to the converter: parallel would let one user burst up to
      // 10 concurrent PDFs at the converter's worker pool and starve other
      // tenants. Total wall time stays bounded by MAX_BATCH_SIZE * per-doc.
      //
      // `input` is whatever the caller passed (UUID or slug) — we always echo
      // the canonical `postId` (real UUID) back in the manifest so downstream
      // tooling has a stable reference.
      //
      // Stop once the caller has gone away (CLI timeout, Ctrl-C): nobody will
      // read the zip, and exportConcurrencyLimit has already freed the slot.
      let clientGone = false;
      res.once("close", () => {
        if (!res.writableFinished) clientGone = true;
      });
      for (const input of postIds) {
        if (clientGone) return;
        const row = rowByInput.get(input);
        if (!row) {
          results.push({
            postId: input,
            success: false,
            error: "not_found",
            message: "Document not found, or you can't read it.",
          });
          continue;
        }
        try {
          let paid = paidByWorkspace.get(row.workspaceId);
          if (paid === undefined) {
            paid = await isPaidWorkspace(row.workspaceId);
            paidByWorkspace.set(row.workspaceId, paid);
          }
          if (format === "docx" && !paid) {
            results.push({ postId: input, success: false, ...DOCX_REQUIRES_PRO });
            continue;
          }
          // Layer workspace defaults under the caller-supplied branding so the
          // CLI's explicit --accent-color or custom font still wins (paid
          // workspaces only), but an empty-body call picks up the workspace's
          // configured brand.
          const resolved = resolveExportBranding(
            wsDefaults.get(row.workspaceId),
            paid ? { accent_color, branding } : { accent_color },
          );

          const cacheInputs = {
            workspaceId: row.workspaceId,
            format: format as ConvertFormat,
            landscape: landscape ?? false,
            rawMarkdown: row.rawMarkdown,
            resolvedBranding: resolved.branding,
            resolvedAccentColor: resolved.accent_color,
          };

          // Cache hit: skip the converter entirely, put bytes straight
          // into the zip. Filename follows the same `<slug>.<ext>`
          // convention the converter uses, so the zip layout is
          // indistinguishable from a fresh-conversion batch.
          const cached = await getCachedExport(cacheInputs);
          if (cached) {
            const filename = `${row.slug}.${format}`;
            zip.file(filename, cached.buffer);
            results.push({
              postId: row.id,
              success: true,
              slug: row.slug,
              filename,
              bytes: cached.buffer.length,
              cached: true,
            });
            cacheHits++;
            continue;
          }

          const { buffer, filename } = await convertMarkdown(
            format as ConvertFormat,
            {
              markdown: row.rawMarkdown,
              filename: row.slug,
              landscape,
              accent_color: resolved.accent_color,
              branding: resolved.branding,
            },
          );
          zip.file(filename, buffer);
          results.push({
            postId: row.id,
            success: true,
            slug: row.slug,
            filename,
            bytes: buffer.length,
            cached: false,
          });
          cacheMisses++;

          // Fire-and-forget cache write — same pattern as the single-
          // export route. Do not block the next doc in the loop on this.
          void storeCachedExport(cacheInputs, buffer);
        } catch (err) {
          const converterErr =
            err instanceof Error && err.message.startsWith("converter responded");
          const timeoutErr = err instanceof Error && err.name === "AbortError";
          results.push({
            postId: row.id,
            success: false,
            error: converterErr
              ? "converter_failed"
              : timeoutErr
                ? "converter_timeout"
                : "export_failed",
            message: converterErr
              ? "Document converter failed."
              : timeoutErr
                ? "Document converter timed out."
                : "Unable to export document.",
          });
        }
      }

      const succeeded = results.filter((r) => r.success).length;
      const manifest = {
        format,
        results,
        summary: {
          total: postIds.length,
          succeeded,
          failed: results.length - succeeded,
          // Surface cache stats in the manifest so the CLI can show a
          // "3 of 10 served from cache" line without having to count
          // flags itself. Absent when the cache is disabled so no stat
          // is misleading.
          ...(isExportCacheEnabled()
            ? { cacheHits, cacheMisses }
            : {}),
        },
      };
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      const stamp = new Date().toISOString().slice(0, 10);

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="opendocs-export-${stamp}.zip"`,
      );
      // Small-manifest-in-header pattern lets the CLI render progress lines
      // before touching the zip. Canonical copy still lives inside the zip
      // as manifest.json so the response is self-contained if saved to disk.
      res.setHeader(
        "X-Batch-Manifest",
        Buffer.from(JSON.stringify(manifest)).toString("base64"),
      );
      res.status(200).send(zipBuffer);
    } catch (err) {
      next(err);
    }
  },
);

export type ExportResult =
  | { ok: true; buffer: Buffer; filename: string; contentType: string; cache: "HIT" | "MISS" | null }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Renders one document as PDF or DOCX for a user who can read it: the
 * access check, plan check, workspace branding and the R2 export cache.
 * Used by the export route and by download links (MCP tools hand out a
 * link instead of file bytes; opening it renders the file as the user who
 * asked for it). Converter failures are thrown; see converterFailure.
 */
export async function exportPostForUser(input: {
  userId: string;
  postIdOrSlug: string;
  workspaceId: string | undefined;
  projectId: string | undefined;
  format: ConvertFormat;
  body: z.infer<typeof exportBodySchema>;
}): Promise<ExportResult> {
  const { userId, postIdOrSlug, workspaceId, projectId, format, body } = input;

  // Mirror /posts/:postId/raw — same access check + markdown lookup.
  const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, projectId);
  const db = getDbOrThrow();
  const [row] = post
    ? await db
        .select({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          workspaceId: posts.workspaceId,
          rawMarkdown: postVersions.rawMarkdown,
        })
        .from(posts)
        .innerJoin(postVersions, eq(posts.currentVersionId, postVersions.id))
        .where(eq(posts.id, post.id))
        .limit(1)
    : [];

  if (!row) {
    return { ok: false, status: 404, body: await buildNotFoundBody(userId, postIdOrSlug, workspaceId) };
  }

  const paid = await isPaidWorkspace(row.workspaceId);
  if (format === "docx" && !paid) {
    return { ok: false, status: 403, body: DOCX_REQUIRES_PRO };
  }

  // Same precedence as batch: workspace defaults underneath, caller body
  // on top (paid workspaces only). Single-doc endpoint still does one
  // round trip to pull the workspace row — keyed cache in the helper
  // keeps it cheap.
  const wsDefaults = await getWorkspaceExportDefaultsMap([row.workspaceId]);
  const resolved = resolveExportBranding(
    wsDefaults.get(row.workspaceId),
    paid ? { accent_color: body.accent_color, branding: body.branding } : { accent_color: body.accent_color },
  );

  // Content-addressed cache. Inputs (workspaceId + markdown + branding +
  // format + landscape) are all that affect the converter's output bytes,
  // so the same inputs always map to the same cache entry. The privacy
  // model is described in lib/export-cache.ts.
  const cacheInputs = {
    workspaceId: row.workspaceId,
    format,
    landscape: body.landscape ?? false,
    rawMarkdown: row.rawMarkdown,
    resolvedBranding: resolved.branding,
    resolvedAccentColor: resolved.accent_color,
  };

  // Use a user-supplied filename when provided, else fall back to the
  // post's slug. The Content-Disposition is set at serve time so a
  // cache hit still returns `my-doc.pdf` even though the R2 key is an
  // opaque hash.
  const outFilename = `${body.filename ?? row.slug}.${format}`;

  const cached = await getCachedExport(cacheInputs);
  if (cached) {
    return { ok: true, buffer: cached.buffer, filename: outFilename, contentType: cached.contentType, cache: "HIT" };
  }

  const { buffer, filename, contentType } = await convertMarkdown(format, {
    markdown: row.rawMarkdown,
    filename: body.filename ?? row.slug,
    landscape: body.landscape,
    accent_color: resolved.accent_color,
    branding: resolved.branding,
  });

  // Fire-and-forget cache write. We don't await it — a failed upload is
  // purely an efficiency regression (next call regenerates). The helper
  // swallows errors internally, so this `void` is safe.
  void storeCachedExport(cacheInputs, buffer);
  return { ok: true, buffer, filename, contentType, cache: isExportCacheEnabled() ? "MISS" : null };
}

router.post(
  "/posts/:postId/export/:format",
  requireAuth,
  exportRateLimit,
  exportConcurrencyLimit,
  validateBody(exportBodySchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const format = req.params.format;

      // Express 5's path-to-regexp no longer supports inline regex on params,
      // so we validate format manually. Returning 404 keeps the URL surface
      // feeling like docx and pdf are the only recognized resources.
      if (format !== "docx" && format !== "pdf") {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const result = await exportPostForUser({
        userId,
        postIdOrSlug: req.params.postId as string,
        workspaceId: readWorkspaceId(req),
        projectId: readProjectId(req),
        format,
        body: req.body as z.infer<typeof exportBodySchema>,
      });
      if (!result.ok) {
        res.status(result.status).json(result.body);
        return;
      }

      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Disposition", attachmentHeader(result.filename));
      if (result.cache) res.setHeader("X-Cache", result.cache);
      res.send(result.buffer);
    } catch (err) {
      const failure = converterFailure(err);
      if (failure) {
        res.status(failure.status).json(failure.body);
        return;
      }
      next(err);
    }
  },
);

// Export endpoint for the web UI's "Download PDF / DOCX" buttons on
// the article page. Unlike the authenticated CLI route
// (`/posts/:postId/export/:format`), this one is reachable by anyone
// who can already view the article on the web — authors,
// workspace members, and anonymous visitors on public posts. The
// access rules mirror `getPostByWorkspaceSlugAndPostSlug` exactly, so
// the button is always callable when it's rendered on-page:
//   - Author can always download their own posts.
//   - Workspace members can download workspace + public posts.
//   - Anonymous visitors can download only when the workspace has
//     `allowPublicDocuments: true` AND the post is `visibility: "public"`.
// Callers who fail the access check get a 404 (not a 403) so we don't
// leak the existence of private drafts to anonymous probes.
//
// The workspace owner's branding is canonical — the handler ignores
// any body to keep the "workspace settings applied like the CLI does"
// promise. DOCX is gated behind the workspace owner's billing tier
// (Pro+). Reuses the same content-addressed R2 cache as the CLI route
// so a PDF generated by the CLI is instantly served to a web
// downloader (and vice versa).
router.post(
  [
    "/public/posts/:workspaceSlug/:postSlug/export/:format",
    "/public/posts/:workspaceSlug/projects/:projectSlug/:postSlug/export/:format",
  ],
  customDomainViewerAuth,
  publicExportRateLimit,
  optionalAuth,
  async (req, res, next) => {
    try {
      const customDomainViewer = getCustomDomainViewer(req);
      const viewerUserId =
        (req as AuthenticatedRequest).userId ?? customDomainViewer?.userId ?? null;
      const workspaceSlugRaw = req.params.workspaceSlug as string;
      const projectSlugRaw = req.params.projectSlug as string | undefined;
      const postSlugRaw = req.params.postSlug as string;
      const format = req.params.format;

      if (format !== "pdf" && format !== "docx") {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const workspaceSlug = normalizeWorkspaceSlug(workspaceSlugRaw);

      const db = getDbOrThrow();
      const [row] = await db
        .select({
          title: posts.title,
          slug: posts.slug,
          projectSlug: projects.slug,
          isDefaultProject: projects.isDefault,
          workspaceId: posts.workspaceId,
          id: posts.id,
          allowPublicDocuments: workspaces.allowPublicDocuments,
          visibility: posts.visibility,
          authorUserId: posts.authorUserId,
          rawMarkdown: postVersions.rawMarkdown,
        })
        .from(posts)
        .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
        .innerJoin(projects, eq(posts.projectId, projects.id))
        .innerJoin(postVersions, eq(posts.currentVersionId, postVersions.id))
        .where(
          and(
            eq(workspaces.slug, workspaceSlug),
            projectSlugRaw
              ? eq(projects.slug, projectSlugRaw)
              : eq(projects.isDefault, true),
            eq(posts.slug, postSlugRaw),
            eq(posts.isPublished, true),
          ),
        )
        .limit(1);

      // A custom-domain sign-in only reads that domain's workspace.
      if (!row || (customDomainViewer && row.workspaceId !== customDomainViewer.workspaceId)) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      // Mirror the visibility rules of the article page. If the viewer
      // can't see the post, pretend it doesn't exist (404) rather than
      // 403 so we don't leak existence to outsiders.
      const canDownload = await canUserDownloadPost(
        viewerUserId,
        {
          id: row.id,
          visibility: row.visibility,
          authorUserId: row.authorUserId,
          workspaceId: row.workspaceId,
        },
        row.allowPublicDocuments,
      );
      if (!canDownload) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      // DOCX is a paid-tier perk. We key this on the WORKSPACE's plan
      // (not the viewer's) — downloads are a feature the workspace
      // offers its readers, same way custom branding is. Free
      // workspaces get PDF only.
      if (format === "docx") {
        const workspaceTier = (await getEffectiveWorkspaceTier(row.workspaceId)) ?? "free";
        if (workspaceTier === "free") {
          res.status(403).json({
            error: "docx_requires_pro",
            message: "DOCX export is only available on Pro workspaces.",
          });
          return;
        }
      }

      const wsDefaults = await getWorkspaceExportDefaultsMap([row.workspaceId]);
      // Pass `{}` for caller overrides — public export deliberately
      // accepts no body. The workspace owner controls branding.
      const resolved = resolveExportBranding(
        wsDefaults.get(row.workspaceId),
        {},
      );

      const cacheInputs = {
        workspaceId: row.workspaceId,
        format: format as ConvertFormat,
        landscape: false,
        rawMarkdown: row.rawMarkdown,
        resolvedBranding: resolved.branding,
        resolvedAccentColor: resolved.accent_color,
      };

      const outFilename = `${row.slug}.${format}`;

      const cached = await getCachedExport(cacheInputs);
      if (cached) {
        res.setHeader("Content-Type", cached.contentType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${outFilename}"`,
        );
        res.setHeader("X-Cache", "HIT");
        res.send(cached.buffer);
        return;
      }

      const { buffer, filename, contentType } = await convertMarkdown(
        format as ConvertFormat,
        {
          markdown: row.rawMarkdown,
          filename: row.slug,
          landscape: false,
          accent_color: resolved.accent_color,
          branding: resolved.branding,
        },
      );

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      if (isExportCacheEnabled()) res.setHeader("X-Cache", "MISS");
      res.send(buffer);

      void storeCachedExport(cacheInputs, buffer);
    } catch (err) {
      const failure = converterFailure(err);
      if (failure) {
        res.status(failure.status).json(failure.body);
        return;
      }
      next(err);
    }
  },
);

// GET the raw Markdown of a public-facing post. Same access rules
// as the PDF/DOCX export endpoint above (`canUserDownloadPost`)
// so the button on the article page is callable exactly when the
// page itself is viewable. We use GET (not POST) here because the
// response is already content-addressed by URL: same workspace +
// project + post slug always returns the same bytes, and browsers
// can stream it directly via a normal anchor click.
router.get(
  [
    "/public/posts/:workspaceSlug/:postSlug/raw",
    "/public/posts/:workspaceSlug/projects/:projectSlug/:postSlug/raw",
  ],
  customDomainViewerAuth,
  publicRawRateLimit,
  optionalAuth,
  async (req, res, next) => {
    try {
      const customDomainViewer = getCustomDomainViewer(req);
      const viewerUserId =
        (req as AuthenticatedRequest).userId ?? customDomainViewer?.userId ?? null;
      const workspaceSlug = normalizeWorkspaceSlug(
        req.params.workspaceSlug as string,
      );
      const projectSlugRaw = req.params.projectSlug as string | undefined;
      const postSlug = req.params.postSlug as string;

      const db = getDbOrThrow();
      const [row] = await db
        .select({
          id: posts.id,
          slug: posts.slug,
          workspaceId: posts.workspaceId,
          allowPublicDocuments: workspaces.allowPublicDocuments,
          visibility: posts.visibility,
          authorUserId: posts.authorUserId,
          rawMarkdown: postVersions.rawMarkdown,
        })
        .from(posts)
        .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
        .innerJoin(projects, eq(posts.projectId, projects.id))
        .innerJoin(postVersions, eq(posts.currentVersionId, postVersions.id))
        .where(
          and(
            eq(workspaces.slug, workspaceSlug),
            projectSlugRaw
              ? eq(projects.slug, projectSlugRaw)
              : eq(projects.isDefault, true),
            eq(posts.slug, postSlug),
            eq(posts.isPublished, true),
          ),
        )
        .limit(1);

      if (!row || (customDomainViewer && row.workspaceId !== customDomainViewer.workspaceId)) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const canDownload = await canUserDownloadPost(
        viewerUserId,
        {
          id: row.id,
          visibility: row.visibility,
          authorUserId: row.authorUserId,
          workspaceId: row.workspaceId,
        },
        row.allowPublicDocuments,
      );
      if (!canDownload) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      // text/markdown is the canonical IANA-registered type. Older
      // clients may not recognise it but every browser treats it the
      // same as text/plain for download purposes once `Content-
      // Disposition: attachment` is set.
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${row.slug}.md"`,
      );
      // Reader-facing, like the page itself: ```private blocks are the
      // author's notes and never leave through a download. Members who
      // edit get the full source from the authenticated /posts/:id/raw.
      res.send(stripPrivateBlocks(row.rawMarkdown));
    } catch (err) {
      next(err);
    }
  },
);

// GET a ZIP of every post the current viewer may open in a workspace.
// Anonymous visitors only receive public posts from public workspaces.
// Authenticated workspace members also receive workspace-visible posts;
// private/restricted posts are included only for their author, matching
// the individual Markdown download and article-page access checks.
//
// Filenames inside the ZIP use the post slug, with a `manifest.json`
// at the root so the recipient knows what they got. Posts are fetched
// in one access-scoped query and zipped in memory; we cap the workspace
// at `MAX_WORKSPACE_ZIP_POSTS` so a future viral workspace with 10k
// posts can't take the API down.
const MAX_WORKSPACE_ZIP_POSTS = 200;

router.get(
  "/public/workspaces/:workspaceSlug/markdown.zip",
  // Building a ZIP of up to 200 posts costs more than a single export,
  // and we don't want anyone scripting this against every public
  // workspace they can find.
  customDomainViewerAuth,
  workspaceZipRateLimit,
  optionalAuth,
  async (req, res, next) => {
    try {
      const workspaceSlug = normalizeWorkspaceSlug(
        req.params.workspaceSlug as string,
      );
      const customDomainViewer = getCustomDomainViewer(req);
      const viewerUserId =
        (req as AuthenticatedRequest).userId ?? customDomainViewer?.userId ?? null;

      const db = getDbOrThrow();

      // Look up the workspace first so private workspace slugs don't
      // become discoverable to anonymous or non-member viewers.
      const [workspace] = await db
        .select({
          id: workspaces.id,
          slug: workspaces.slug,
          name: workspaces.name,
          allowPublicDocuments: workspaces.allowPublicDocuments,
        })
        .from(workspaces)
        .where(eq(workspaces.slug, workspaceSlug))
        .limit(1);

      if (!workspace || (customDomainViewer && workspace.id !== customDomainViewer.workspaceId)) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const membershipWorkspaceIds = await getViewerWorkspaceIds(viewerUserId);
      const viewerIsMember = membershipWorkspaceIds.includes(workspace.id);

      if (!workspace.allowPublicDocuments && !viewerIsMember) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const accessClauses = [];
      if (workspace.allowPublicDocuments) {
        accessClauses.push(eq(posts.visibility, "public"));
      }
      if (viewerIsMember) {
        accessClauses.push(inArray(posts.visibility, ["workspace", "public"]));
      }
      if (viewerUserId) {
        accessClauses.push(eq(posts.authorUserId, viewerUserId));
      }

      const rows = await db
        .select({
          slug: posts.slug,
          title: posts.title,
          updatedAt: posts.updatedAt,
          workspaceId: posts.workspaceId,
          authorUserId: posts.authorUserId,
          visibility: posts.visibility,
          rawMarkdown: postVersions.rawMarkdown,
          projectSlug: projects.slug,
          isDefaultProject: projects.isDefault,
        })
        .from(posts)
        .innerJoin(projects, eq(posts.projectId, projects.id))
        .innerJoin(postVersions, eq(posts.currentVersionId, postVersions.id))
        .where(
          and(
            eq(posts.workspaceId, workspace.id),
            eq(posts.isPublished, true),
            accessClauses.length === 1
              ? accessClauses[0]
              : or(...accessClauses),
          ),
        )
        .orderBy(desc(posts.updatedAt))
        .limit(MAX_WORKSPACE_ZIP_POSTS);

      const accessibleRows = rows.filter((row) =>
        canViewerAccessPost(
          row,
          viewerUserId,
          membershipWorkspaceIds,
          workspace.allowPublicDocuments,
        ),
      );

      if (accessibleRows.length === 0) {
        res.status(404).json({
          error: "no_accessible_posts",
          message: "No documents are available to download.",
        });
        return;
      }

      const zip = new JSZip();

      // Posts get nested under their project folder so a workspace
      // with multiple projects keeps its structure on disk. The
      // default project's posts go at the root rather than under
      // `default/` since "default" is an implementation detail.
      for (const row of accessibleRows) {
        const path = row.isDefaultProject
          ? `${row.slug}.md`
          : `${row.projectSlug}/${row.slug}.md`;
        zip.file(path, stripPrivateBlocks(row.rawMarkdown));
      }

      // Manifest gives the recipient enough context to re-publish
      // the bundle elsewhere if they want to mirror the workspace.
      const manifest = {
        workspace: workspace.slug,
        workspaceName: workspace.name,
        downloadedAt: new Date().toISOString(),
        postCount: accessibleRows.length,
        posts: accessibleRows.map((r) => ({
          slug: r.slug,
          title: r.title,
          updatedAt: r.updatedAt,
          path: r.isDefaultProject
            ? `${r.slug}.md`
            : `${r.projectSlug}/${r.slug}.md`,
        })),
      };
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));

      const buffer = await zip.generateAsync({ type: "nodebuffer" });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${workspace.slug}-markdown.zip"`,
      );
      res.setHeader("Content-Length", buffer.length.toString());
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// History, move and sharing
// ---------------------------------------------------------------------------

function sendManageError(
  res: import("express").Response,
  err: unknown,
  fallback: { error: string; message: string },
) {
  const message = err instanceof Error ? err.message : "";
  if (message === "You do not have permission to manage this document.") {
    res.status(403).json({
      error: "forbidden",
      message: "Only the author or a workspace admin can do that.",
    });
    return;
  }
  if (err instanceof PostPermissionError) {
    res.status(403).json({ error: "forbidden", message });
    return;
  }
  if (message === "Post not found.") {
    res.status(404).json({ error: "not_found", message: "Document not found." });
    return;
  }
  if (message === "Project not found.") {
    res.status(404).json({ error: "project_not_found", message });
    return;
  }
  if (message.startsWith("Cannot ")) {
    res.status(400).json({ error: fallback.error, message });
    return;
  }
  res.status(400).json(fallback);
}

router.get("/posts/:postId/versions", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const postIdOrSlug = req.params.postId as string;
    const workspaceId = readWorkspaceId(req);
    const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, readProjectId(req));
    if (!post) {
      res.status(404).json(await buildNotFoundBody(userId, postIdOrSlug, workspaceId));
      return;
    }
    res.json({ postId: post.id, versions: await listPostVersions(post.id) });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/posts/:postId/versions/:versionNumber/raw",
  requireAuth,
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const postIdOrSlug = req.params.postId as string;
      const workspaceId = readWorkspaceId(req);
      const versionNumber = Number(req.params.versionNumber);
      const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, readProjectId(req));
      if (!post) {
        res.status(404).json(await buildNotFoundBody(userId, postIdOrSlug, workspaceId));
        return;
      }
      const version = Number.isInteger(versionNumber)
        ? await getPostVersionMarkdown(post.id, versionNumber)
        : null;
      if (!version) {
        res.status(404).json({
          error: "version_not_found",
          message: `Version ${req.params.versionNumber} does not exist. Run \`opendocs history <doc>\` to list versions.`,
        });
        return;
      }
      res.json({
        postId: post.id,
        versionNumber: version.versionNumber,
        createdAt: version.createdAt,
        markdown: post.viewerIsMember
          ? version.rawMarkdown
          : stripPrivateBlocks(version.rawMarkdown),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/posts/:postId/versions/:versionNumber/restore",
  requireAuth,
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const postIdOrSlug = req.params.postId as string;
      const workspaceId = readWorkspaceId(req);
      const versionNumber = Number(req.params.versionNumber);
      const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, readProjectId(req));
      if (!post) {
        res.status(404).json(await buildNotFoundBody(userId, postIdOrSlug, workspaceId));
        return;
      }
      const result = Number.isInteger(versionNumber)
        ? await restorePostVersion(userId, post.id, versionNumber, { client: readClient(req) })
        : null;
      if (!result) {
        res.status(404).json({
          error: "version_not_found",
          message: `Version ${req.params.versionNumber} does not exist. Run \`opendocs history <doc>\` to list versions.`,
        });
        return;
      }
      res.json(result);
    } catch (err) {
      sendManageError(res, err, {
        error: "restore_failed",
        message: "Unable to restore that version.",
      });
    }
  },
);

router.post(
  "/posts/:postId/move",
  requireAuth,
  validateBody(movePostInputSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const postIdOrSlug = req.params.postId as string;
      const workspaceId = readWorkspaceId(req);
      const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, readProjectId(req));
      if (!post) {
        res.status(404).json(await buildNotFoundBody(userId, postIdOrSlug, workspaceId));
        return;
      }
      const body = req.body as z.infer<typeof movePostInputSchema>;
      const moved = await movePostToProject(userId, post.id, body);
      res.json(await withPublicUrl(moved.postId, moved));
    } catch (err) {
      sendManageError(res, err, {
        error: "move_failed",
        message: "Unable to move document.",
      });
    }
  },
);

router.get("/posts/:postId/share", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const postIdOrSlug = req.params.postId as string;
    const workspaceId = readWorkspaceId(req);
    const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, readProjectId(req));
    if (!post) {
      res.status(404).json(await buildNotFoundBody(userId, postIdOrSlug, workspaceId));
      return;
    }
    res.json({ postId: post.id, ...(await listPostShares(userId, post.id)) });
  } catch (err) {
    sendManageError(res, err, { error: "share_failed", message: "Unable to read sharing." });
  }
});

router.post(
  "/posts/:postId/share",
  requireAuth,
  validateBody(sharePostInputSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const postIdOrSlug = req.params.postId as string;
      const workspaceId = readWorkspaceId(req);
      const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, readProjectId(req));
      if (!post) {
        res.status(404).json(await buildNotFoundBody(userId, postIdOrSlug, workspaceId));
        return;
      }
      const body = req.body as z.infer<typeof sharePostInputSchema>;
      res.json({ postId: post.id, ...(await addPostShares(userId, post.id, body)) });
    } catch (err) {
      sendManageError(res, err, { error: "share_failed", message: "Unable to share document." });
    }
  },
);

router.delete(
  "/posts/:postId/share",
  requireAuth,
  validateBody(unsharePostInputSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const postIdOrSlug = req.params.postId as string;
      const workspaceId = readWorkspaceId(req);
      const post = await findAccessiblePost(userId, postIdOrSlug, workspaceId, readProjectId(req));
      if (!post) {
        res.status(404).json(await buildNotFoundBody(userId, postIdOrSlug, workspaceId));
        return;
      }
      const body = req.body as z.infer<typeof unsharePostInputSchema>;
      res.json({ postId: post.id, ...(await removePostShares(userId, post.id, body)) });
    } catch (err) {
      sendManageError(res, err, { error: "unshare_failed", message: "Unable to update sharing." });
    }
  },
);

export default router;
