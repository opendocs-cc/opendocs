import { createHash } from "node:crypto";
import { and, desc, eq, inArray, like, max, sql } from "drizzle-orm";

import { PLAN_LIMITS, type PlanTier } from "../billing/plan-limits";
import { RENDERER_VERSION, renderMarkdown } from "../markdown/index";
import { getDbOrThrow } from "../db/guards";
import {
  auditEvents,
  posts,
  postTags,
  postVersions,
  projects,
  usernames,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { getEffectiveWorkspaceTier } from "../workspaces/service";
import { extractMarkdownExcerpt } from "./excerpt";
import { rehostRemoteImages } from "./image-rehost";
import { createSlug } from "./slug";
import type { PublishInput, UpdatePostInput } from "./validation";
import { postUrlPath, resolveProjectForUser } from "../projects/service";

const RESERVED_POST_SLUGS = new Set(["tag", "tags", "project", "projects"]);

/**
 * Thrown by `publishPostForUser` when a workspace has hit its plan's
 * document cap. Carries enough context for the API / web / CLI layers
 * to render a useful error without re-querying the DB.
 */
export class PlanLimitError extends Error {
  readonly code = "document_limit" as const;
  constructor(
    public readonly plan: PlanTier,
    public readonly limit: number,
    public readonly used: number,
  ) {
    super(
      `Workspace has reached the ${plan} plan's ${limit}-document limit (currently ${used}).`,
    );
    this.name = "PlanLimitError";
  }
}

/**
 * Thrown by `updatePostForUser` when the caller sent `baseVersionNumber`
 * and the live post has moved past it — someone else published a newer
 * version since the caller's local copy was taken.
 */
export class VersionConflictError extends Error {
  readonly code = "version_conflict" as const;
  constructor(
    public readonly currentVersionNumber: number,
    public readonly baseVersionNumber: number,
    public readonly currentVersionCreatedAt: Date | null,
  ) {
    super(
      `The document is at version ${currentVersionNumber}, but your copy is based on version ${baseVersionNumber}. Pull the latest version and re-apply your changes, or retry with force to overwrite.`,
    );
    this.name = "VersionConflictError";
  }
}

export class ReservedPostSlugError extends Error {
  readonly code = "reserved_slug" as const;
  constructor(public readonly slug: string) {
    super(`"${slug}" is reserved and cannot be used as a document slug.`);
    this.name = "ReservedPostSlugError";
  }
}

/**
 * Count the published (i.e. `isPublished = true`) posts in a workspace.
 * Soft-unpublished posts are excluded — unpublishing is the user-visible
 * escape hatch for the Free cap.
 */
export async function getPublishedPostCount(
  workspaceId: string,
): Promise<number> {
  const database = getDbOrThrow();
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(posts)
    .where(
      and(eq(posts.workspaceId, workspaceId), eq(posts.isPublished, true)),
    );
  return row?.count ?? 0;
}

/** SHA-256 of the Markdown as the caller sent it (before image rehosting). */
export function contentHashOf(markdown: string): string {
  return createHash("sha256").update(markdown, "utf8").digest("hex");
}

// posts.slug is varchar(160) and posts.title varchar(255). Leave room in
// the slug for a "-NN" collision suffix so a long H1 can't fail the insert.
const MAX_SLUG_BASE_LENGTH = 150;
const MAX_TITLE_LENGTH = 255;

function clampSlugBase(slug: string): string {
  return slug.slice(0, MAX_SLUG_BASE_LENGTH).replace(/-+$/, "");
}

function clampTitle(title: string): string {
  return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1)}…` : title;
}

export type PostWriteOptions = {
  /** Agent/tool that made the change, from the X-OpenDocs-Client header. */
  client?: string | null;
};

function versionSourceMetadata(args: {
  sourcePath?: string;
  contentHash: string;
  client?: string | null;
  title?: string;
  restoredFromVersion?: number;
}) {
  return {
    ...(args.sourcePath ? { sourcePath: args.sourcePath } : {}),
    contentHash: args.contentHash,
    ...(args.client ? { client: args.client } : {}),
    ...(args.title ? { title: args.title } : {}),
    ...(args.restoredFromVersion ? { restoredFromVersion: args.restoredFromVersion } : {}),
    rendererVersion: RENDERER_VERSION,
  };
}

export async function resolveUniqueSlug(projectId: string, baseSlug: string) {
  const database = getDbOrThrow();
  let candidateBase = baseSlug || "document";
  if (RESERVED_POST_SLUGS.has(candidateBase)) {
    candidateBase = `${candidateBase}-2`;
  }
  const existing = await database
    .select({
      slug: posts.slug,
    })
    .from(posts)
    .where(and(eq(posts.projectId, projectId), like(posts.slug, `${candidateBase}%`)))
    .orderBy(desc(posts.slug));

  if (!existing.some((item) => item.slug === candidateBase)) {
    return candidateBase;
  }

  let counter = 2;
  while (existing.some((item) => item.slug === `${candidateBase}-${counter}`)) {
    counter += 1;
  }

  return `${candidateBase}-${counter}`;
}

export async function publishPostForUser(
  userId: string,
  input: PublishInput,
  options: PostWriteOptions = {},
) {
  const database = getDbOrThrow();

  // Look up the user's username for attribution (optional — kept for display).
  const [profile] = await database
    .select({
      usernameId: usernames.id,
    })
    .from(usernames)
    .where(eq(usernames.userId, userId))
    .limit(1);

  // Verify workspace membership and get the workspace slug for URL construction.
  const [workspaceRecord] = await database
    .select({
      id: workspaceMembers.workspaceId,
      slug: workspaces.slug,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaceMembers.workspaceId, input.workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active"),
      ),
    )
    .limit(1);

  if (!workspaceRecord) {
    throw new Error("Workspace not found.");
  }

  const project = await resolveProjectForUser({
    userId,
    workspaceId: workspaceRecord.id,
    projectId: input.projectId,
    projectSlug: input.projectSlug,
  });
  if (!project) {
    throw new Error("Project not found.");
  }

  // Enforce the plan's per-workspace document cap. `publishPostForUser`
  // always inserts a new row (slug collisions auto-suffix via
  // resolveUniqueSlug), so every successful call grows the count by 1.
  // `Number.POSITIVE_INFINITY` on Pro/Team short-circuits the DB count.
  const tier = (await getEffectiveWorkspaceTier(workspaceRecord.id)) ?? "free";
  const limit = PLAN_LIMITS[tier].documentsPerWorkspace;
  if (Number.isFinite(limit)) {
    const used = await getPublishedPostCount(workspaceRecord.id);
    if (used >= limit) {
      throw new PlanLimitError(tier, limit, used);
    }
  }

  // Rehost remote images (Wikimedia, Unsplash, etc.) to R2 so exports
  // and the public post can load them reliably. Best-effort — anything
  // we can't rehost falls through with the original URL intact.
  const { markdown: rehostedMarkdown } = await rehostRemoteImages({
    markdown: input.markdown,
    workspaceId: workspaceRecord.id,
  });

  const rendered = await renderMarkdown(rehostedMarkdown);
  const slugBase = clampSlugBase(createSlug(input.slug ?? input.title ?? rendered.title));
  if (input.slug && RESERVED_POST_SLUGS.has(slugBase)) {
    throw new ReservedPostSlugError(slugBase);
  }
  const slug = await resolveUniqueSlug(project.id, slugBase);
  const title = clampTitle(input.title ?? rendered.title);
  const contentHash = contentHashOf(input.markdown);

  const summary = extractMarkdownExcerpt(rendered.content) || null;

  return database.transaction(async (tx) => {
    const [post] = await tx
      .insert(posts)
      .values({
        authorUserId: userId,
        usernameId: profile?.usernameId ?? null,
        workspaceId: workspaceRecord.id,
        projectId: project.id,
        slug,
        title,
        summary,
        visibility: input.visibility,
      })
      .returning({
        id: posts.id,
      });

    const [version] = await tx
      .insert(postVersions)
      .values({
        postId: post.id,
        versionNumber: 1,
        rawMarkdown: rehostedMarkdown,
        renderedHtml: rendered.html,
        toc: rendered.toc,
        sourceMetadata: versionSourceMetadata({
          sourcePath: input.sourcePath,
          contentHash,
          client: options.client,
          title: input.title,
        }),
        createdByUserId: userId,
      })
      .returning({
        id: postVersions.id,
      });

    await tx
      .update(posts)
      .set({
        currentVersionId: version.id,
      })
      .where(eq(posts.id, post.id));

    const tags = [...new Set(input.tags.map((tag) => tag.toLowerCase()))];
    if (tags.length > 0) {
      await tx.insert(postTags).values(
        tags.map((tag) => ({
          postId: post.id,
          tag,
        })),
      );
    }

    await tx.insert(auditEvents).values({
      actorUserId: userId,
      workspaceId: workspaceRecord.id,
      postId: post.id,
      eventType: "published",
      metadata: {
        visibility: input.visibility,
        slug,
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
        isDefaultProject: project.isDefault,
        ...(options.client ? { client: options.client } : {}),
      },
    });

    return {
      postId: post.id,
      slug,
      url: postUrlPath(workspaceRecord.slug, project, slug),
      title,
      tags,
      versionId: version.id,
      versionNumber: 1,
      contentHash,
      projectId: project.id,
      projectSlug: project.slug,
      projectName: project.name,
      isDefaultProject: project.isDefault,
    };
  });
}

export async function updatePostForUser(
  userId: string,
  postId: string,
  input: UpdatePostInput,
  options: PostWriteOptions = {},
) {
  const database = getDbOrThrow();

  const [post] = await database
    .select({
      id: posts.id,
      authorUserId: posts.authorUserId,
      isPublished: posts.isPublished,
      workspaceId: posts.workspaceId,
      workspaceSlug: workspaces.slug,
      projectId: posts.projectId,
      projectSlug: projects.slug,
      projectName: projects.name,
      isDefaultProject: projects.isDefault,
      slug: posts.slug,
      title: posts.title,
      usernameId: posts.usernameId,
      visibility: posts.visibility,
      currentVersionId: posts.currentVersionId,
    })
    .from(posts)
    .innerJoin(projects, eq(posts.projectId, projects.id))
    .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
    .where(eq(posts.id, postId))
    .limit(1);

  if (!post) {
    throw new Error("Post not found.");
  }

  await assertCanEditWorkspacePost(userId, post);
  if (input.visibility !== undefined && input.visibility !== post.visibility) {
    await assertCanManageWorkspacePost(userId, post);
  }

  if (!post.isPublished) {
    throw new Error("Cannot update an unpublished post.");
  }

  const [currentVersion] = post.currentVersionId
    ? await database
        .select({
          versionNumber: postVersions.versionNumber,
          sourceMetadata: postVersions.sourceMetadata,
          createdAt: postVersions.createdAt,
        })
        .from(postVersions)
        .where(eq(postVersions.id, post.currentVersionId))
        .limit(1)
    : [];

  if (
    input.baseVersionNumber !== undefined &&
    currentVersion &&
    currentVersion.versionNumber !== input.baseVersionNumber
  ) {
    throw new VersionConflictError(
      currentVersion.versionNumber,
      input.baseVersionNumber,
      currentVersion.createdAt,
    );
  }

  const nextProject =
    input.projectId || input.projectSlug
      ? await resolveProjectForUser({
          userId,
          workspaceId: post.workspaceId,
          projectId: input.projectId,
          projectSlug: input.projectSlug,
        })
      : null;
  if ((input.projectId || input.projectSlug) && !nextProject) {
    throw new Error("Project not found.");
  }
  const movingProject = Boolean(nextProject && nextProject.id !== post.projectId);
  if (movingProject) {
    await assertCanManageWorkspacePost(userId, post);
  }
  // Slugs are unique per project, so a move must re-check the slug in the
  // target project instead of hitting the unique index mid-transaction.
  const nextSlug =
    movingProject && nextProject ? await resolveUniqueSlug(nextProject.id, post.slug) : post.slug;
  const targetProject = movingProject && nextProject ? nextProject : null;

  const contentHash = contentHashOf(input.markdown);
  const nextVisibility = input.visibility ?? post.visibility;
  const nextTags =
    input.tags ??
    (
      await database
        .select({ tag: postTags.tag })
        .from(postTags)
        .where(eq(postTags.postId, postId))
    ).map((row) => row.tag);

  const projectResult = {
    projectId: targetProject?.id ?? post.projectId,
    projectSlug: targetProject?.slug ?? post.projectSlug,
    projectName: targetProject?.name ?? post.projectName,
    isDefaultProject: targetProject?.isDefault ?? post.isDefaultProject,
  };
  const url = postUrlPath(
    post.workspaceSlug,
    { slug: projectResult.projectSlug, isDefault: projectResult.isDefaultProject },
    nextSlug,
  );

  // Byte-identical content: don't mint a new version. Metadata the caller
  // explicitly changed (title, visibility, tags, project) still applies.
  const previousHash = (currentVersion?.sourceMetadata as { contentHash?: unknown } | null)
    ?.contentHash;
  if (currentVersion && post.currentVersionId && previousHash === contentHash) {
    const nextTitle = input.title ? clampTitle(input.title) : post.title;
    await database.transaction(async (tx) => {
      const metadataChanged =
        nextTitle !== post.title ||
        nextVisibility !== post.visibility ||
        input.tags !== undefined ||
        movingProject;
      if (metadataChanged) {
        await tx
          .update(posts)
          .set({
            title: nextTitle,
            visibility: nextVisibility,
            ...(targetProject ? { projectId: targetProject.id, slug: nextSlug } : {}),
            updatedAt: new Date(),
          })
          .where(eq(posts.id, postId));
      }
      if (input.tags !== undefined) {
        await tx.delete(postTags).where(eq(postTags.postId, postId));
        if (nextTags.length > 0) {
          await tx.insert(postTags).values(nextTags.map((tag) => ({ postId, tag })));
        }
      }
    });

    return {
      postId,
      versionId: post.currentVersionId,
      versionNumber: currentVersion.versionNumber,
      unchanged: true as const,
      contentHash,
      slug: nextSlug,
      url,
      title: nextTitle,
      visibility: nextVisibility,
      tags: nextTags,
      ...projectResult,
    };
  }

  const { markdown: rehostedMarkdown } = await rehostRemoteImages({
    markdown: input.markdown,
    workspaceId: post.workspaceId,
  });

  const rendered = await renderMarkdown(rehostedMarkdown);
  const title = clampTitle(input.title ?? rendered.title);
  const summary = extractMarkdownExcerpt(rendered.content) || null;

  return database.transaction(async (tx) => {
    // Computed inside the transaction (after the row lock below) so two
    // concurrent updates can't both claim the same version number.
    await tx.execute(sql`select 1 from ${posts} where ${posts.id} = ${postId} for update`);
    const [maxVersionRow] = await tx
      .select({ maxVersion: max(postVersions.versionNumber) })
      .from(postVersions)
      .where(eq(postVersions.postId, postId));
    const nextVersion = (maxVersionRow?.maxVersion ?? 0) + 1;

    const [version] = await tx
      .insert(postVersions)
      .values({
        postId,
        versionNumber: nextVersion,
        rawMarkdown: rehostedMarkdown,
        renderedHtml: rendered.html,
        toc: rendered.toc,
        sourceMetadata: versionSourceMetadata({
          sourcePath: input.sourcePath,
          contentHash,
          client: options.client,
          title: input.title,
        }),
        createdByUserId: userId,
      })
      .returning({ id: postVersions.id });

    await tx
      .update(posts)
      .set({
        currentVersionId: version.id,
        title,
        summary,
        visibility: nextVisibility,
        ...(targetProject ? { projectId: targetProject.id, slug: nextSlug } : {}),
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));

    if (input.tags !== undefined) {
      await tx.delete(postTags).where(eq(postTags.postId, postId));

      if (nextTags.length > 0) {
        await tx.insert(postTags).values(
          nextTags.map((tag) => ({
            postId,
            tag,
          })),
        );
      }
    }

    await tx.insert(auditEvents).values({
      actorUserId: userId,
      workspaceId: post.workspaceId,
      postId,
      eventType: "updated",
      metadata: {
        versionNumber: nextVersion,
        visibility: nextVisibility,
        ...(options.client ? { client: options.client } : {}),
      },
    });

    return {
      postId,
      versionId: version.id,
      versionNumber: nextVersion,
      unchanged: false as const,
      contentHash,
      slug: nextSlug,
      url,
      title,
      visibility: nextVisibility,
      tags: nextTags,
      ...projectResult,
    };
  });
}

/**
 * Moves a post to another project in the same workspace without touching
 * its content. The author or a workspace admin may move it. If the slug is
 * taken in the target project it gets a "-2"-style suffix, so the response
 * carries the new slug and URL.
 */
export async function movePostToProject(
  userId: string,
  postId: string,
  target: { projectId?: string; projectSlug?: string },
) {
  const database = getDbOrThrow();
  const [post] = await database
    .select({
      id: posts.id,
      authorUserId: posts.authorUserId,
      workspaceId: posts.workspaceId,
      workspaceSlug: workspaces.slug,
      projectId: posts.projectId,
      slug: posts.slug,
    })
    .from(posts)
    .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
    .where(eq(posts.id, postId))
    .limit(1);

  if (!post) {
    throw new Error("Post not found.");
  }

  await assertCanManageWorkspacePost(userId, post);

  const project = await resolveProjectForUser({
    userId,
    workspaceId: post.workspaceId,
    projectId: target.projectId,
    projectSlug: target.projectSlug,
  });
  if (!project) {
    throw new Error("Project not found.");
  }

  const result = (slug: string) => ({
    postId,
    slug,
    url: postUrlPath(post.workspaceSlug, project, slug),
    projectId: project.id,
    projectSlug: project.slug,
    projectName: project.name,
    isDefaultProject: project.isDefault,
  });

  if (project.id === post.projectId) {
    return { ...result(post.slug), moved: false as const };
  }

  const slug = await resolveUniqueSlug(project.id, post.slug);
  await database.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({ projectId: project.id, slug, updatedAt: new Date() })
      .where(eq(posts.id, postId));
    await tx.insert(auditEvents).values({
      actorUserId: userId,
      workspaceId: post.workspaceId,
      postId,
      eventType: "moved",
      metadata: {
        fromProjectId: post.projectId,
        toProjectId: project.id,
        fromSlug: post.slug,
        toSlug: slug,
      },
    });
  });

  return { ...result(slug), moved: true as const, previousSlug: post.slug };
}

/** Takes a post offline without deleting it. The author or a workspace admin may. */
export async function unpublishPost(userId: string, postId: string) {
  const database = getDbOrThrow();

  const [post] = await database
    .select({
      id: posts.id,
      authorUserId: posts.authorUserId,
      isPublished: posts.isPublished,
      workspaceId: posts.workspaceId,
    })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!post) {
    throw new Error("Post not found.");
  }

  await assertCanManageWorkspacePost(userId, post);

  if (!post.isPublished) {
    throw new Error("Post is already unpublished.");
  }

  return database.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({
        isPublished: false,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));

    await tx.insert(auditEvents).values({
      actorUserId: userId,
      workspaceId: post.workspaceId,
      postId,
      eventType: "unpublished",
    });

    return { postId, unpublished: true };
  });
}

export async function deleteWorkspacePostForUser(userId: string, postId: string) {
  const database = getDbOrThrow();

  const [post] = await database
    .select({
      id: posts.id,
      authorUserId: posts.authorUserId,
      workspaceId: posts.workspaceId,
      slug: posts.slug,
    })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!post) {
    throw new Error("Post not found.");
  }

  await assertCanManageWorkspacePost(userId, post);

  return deletePostRecord(userId, postId, post);
}

/** The post exists, but this user may not change it this way. */
export class PostPermissionError extends Error {
  readonly code = "forbidden";
}

async function isActiveWorkspaceMember(userId: string, workspaceId: string) {
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

/**
 * Editing a document (publishing a new version, changing tags, restoring a
 * version) is open to its author and every active member of its workspace.
 * OpenDocs is a team tool, and the version history records who made each
 * change. Visibility, moves, unpublishing and deleting stay with the author,
 * owners and admins (`assertCanManageWorkspacePost`).
 */
export async function assertCanEditWorkspacePost(
  userId: string,
  post: { authorUserId: string; workspaceId: string },
) {
  if (post.authorUserId === userId) return;
  if (!(await isActiveWorkspaceMember(userId, post.workspaceId))) {
    throw new PostPermissionError(
      "Only members of this document's workspace can edit it.",
    );
  }
}

export async function assertCanManageWorkspacePost(
  userId: string,
  post: {
    authorUserId: string;
    workspaceId: string;
  },
) {
  if (post.authorUserId === userId) {
    return;
  }

  const membership = await isActiveWorkspaceMember(userId, post.workspaceId);
  if (!membership || membership.role === "member") {
    throw new PostPermissionError("You do not have permission to manage this document.");
  }
}

function deletePostRecord(
  actorUserId: string,
  postId: string,
  post: {
    id: string;
    authorUserId: string;
    workspaceId: string;
    slug: string;
  },
) {
  const database = getDbOrThrow();

  return database.transaction(async (tx) => {
    // Clear the currentVersionId to break circular FK
    await tx
      .update(posts)
      .set({ currentVersionId: null })
      .where(eq(posts.id, postId));

    // Delete related records
    await tx.delete(postTags).where(eq(postTags.postId, postId));
    await tx.delete(postVersions).where(eq(postVersions.postId, postId));

    // Delete the post
    await tx.delete(posts).where(eq(posts.id, postId));

    // Log audit event (postId stored in metadata since the post is now deleted)
    await tx.insert(auditEvents).values({
      actorUserId,
      workspaceId: post.workspaceId,
      eventType: "deleted",
      metadata: {
        deletedPostId: postId,
        slug: post.slug,
      },
    });

    // `slug` is echoed back so CLI/API callers can surface "the slug is
    // now free to reuse" without a follow-up read. The dashboard already
    // ignores this return value, so adding the field is a pure extension.
    return { postId, deleted: true as const, slug: post.slug };
  });
}

export async function changeWorkspacePostVisibilityForUser(
  userId: string,
  postId: string,
  visibility: "private" | "workspace" | "public",
  confirmPublic?: boolean,
) {
  const database = getDbOrThrow();

  if (visibility === "public" && !confirmPublic) {
    throw new Error("Public visibility requires explicit confirmation.");
  }

  const [post] = await database
    .select({
      id: posts.id,
      authorUserId: posts.authorUserId,
      isPublished: posts.isPublished,
      workspaceId: posts.workspaceId,
      visibility: posts.visibility,
    })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!post) {
    throw new Error("Post not found.");
  }

  await assertCanManageWorkspacePost(userId, post);

  if (!post.isPublished) {
    throw new Error("Cannot change visibility of an unpublished post.");
  }

  const oldVisibility = post.visibility;

  return database.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({
        visibility,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));

    await tx.insert(auditEvents).values({
      actorUserId: userId,
      workspaceId: post.workspaceId,
      postId,
      eventType: "visibility_changed",
      metadata: {
        from: oldVisibility,
        to: visibility,
      },
    });

    return { postId, visibility };
  });
}

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

export async function getTagsForPostIds(
  postIds: string[],
): Promise<Map<string, string[]>> {
  if (postIds.length === 0) return new Map();
  const database = getDbOrThrow();
  const rows = await database
    .select({ postId: postTags.postId, tag: postTags.tag })
    .from(postTags)
    .where(inArray(postTags.postId, postIds));

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const existing = map.get(row.postId);
    if (existing) existing.push(row.tag);
    else map.set(row.postId, [row.tag]);
  }
  return map;
}

export async function getTagsForPost(postId: string): Promise<string[]> {
  const database = getDbOrThrow();
  const rows = await database
    .select({ tag: postTags.tag })
    .from(postTags)
    .where(eq(postTags.postId, postId));
  return rows.map((r) => r.tag);
}

export async function patchPostTags(
  userId: string,
  postId: string,
  add: string[],
  remove: string[],
): Promise<string[]> {
  const database = getDbOrThrow();

  const [post] = await database
    .select({ id: posts.id, authorUserId: posts.authorUserId, workspaceId: posts.workspaceId })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!post) {
    throw new Error("Post not found.");
  }
  await assertCanEditWorkspacePost(userId, post);

  return database.transaction(async (tx) => {
    if (remove.length > 0) {
      await tx
        .delete(postTags)
        .where(
          and(
            eq(postTags.postId, postId),
            inArray(postTags.tag, remove.map((t) => t.toLowerCase())),
          ),
        );
    }

    if (add.length > 0) {
      await tx
        .insert(postTags)
        .values(add.map((tag) => ({ postId, tag: tag.toLowerCase() })))
        .onConflictDoNothing();
    }

    const currentTags = await tx
      .select({ tag: postTags.tag })
      .from(postTags)
      .where(eq(postTags.postId, postId));

    if (currentTags.length > 20) {
      throw new Error("A post cannot have more than 20 tags.");
    }

    return currentTags.map((r) => r.tag);
  });
}
