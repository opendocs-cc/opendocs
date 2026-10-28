import { and, asc, count, desc, eq, gt, inArray, or, sql } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import { sendEmail, teamInvitationEmail } from "../email";
import { siteConfig } from "../config/site";
import { normalizeStoredRenderedHtml } from "../markdown/normalize-rendered-html";
import { stripPrivateBlocks } from "../markdown/private-blocks";
import { extractMarkdownExcerpt } from "../posts/excerpt";
import { currentRendering } from "../posts/rendering";
import { getTagsForPost, getTagsForPostIds } from "../posts/service";
import { isPostSharedWithViewer } from "../posts/sharing";
import { DEFAULT_POST_SORT, parsePostSort, type PostSort } from "../posts/sort";
import { ensureDefaultProjectForWorkspace } from "../projects/service";
import {
  apiKeys,
  auditEvents,
  posts,
  postTags,
  postVersions,
  projects,
  subscriptions,
  usernames,
  user,
  workspaceDomains,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { createSlug } from "../posts/slug";
import { normalizeUsername, RESERVED_USERNAMES, usernameSchema } from "../usernames";
import { compedTierToPlanTier, normalizeCompedTier, type CompedTier } from "../billing/comped-tiers";
import { PLAN_LIMITS, type PlanTier } from "../billing/plan-limits";
import { releaseUnusedProWorkspaces } from "../billing/pro-workspaces";
import { ensureTeamSeatCapacity, releaseUnusedTeamSeats } from "../billing/team-seats";
import {
  workspaceSlugSchema,
  normalizeWorkspaceSlug,
  isReservedWorkspaceSlug,
  exportFontSchema,
  exportFooterSchema,
  FREE_PLAN_EXPORT_DEFAULTS,
  type ExportFooterInput,
} from "./validation";
import { inCurrentBillingEnvironment } from "../billing/environment";

/**
 * Billing follows membership: once someone stops being a member, the
 * owner's Team seats (and Pro workspace slots) are lowered to match.
 * Best effort, so a Paddle hiccup never fails the membership change.
 */
export async function releaseUnusedBilling(ownerUserId: string, opts: { workspaces?: boolean } = {}) {
  try {
    await releaseUnusedTeamSeats(ownerUserId);
    if (opts.workspaces) await releaseUnusedProWorkspaces(ownerUserId);
  } catch (error) {
    console.error("[billing] releasing unused seats or workspaces failed:", error);
  }
}

async function getWorkspaceOwnerId(workspaceId: string): Promise<string | null> {
  const [row] = await getDbOrThrow()
    .select({ ownerUserId: workspaces.ownerUserId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return row?.ownerUserId ?? null;
}

type OnboardingInput = {
  userId: string;
  username: string;
  /**
   * Full display name for the user. When provided we persist it on the
   * `usernames` row alongside the chosen handle so attribution shows the
   * human-readable name rather than just the slug. Optional so existing
   * API clients (CLI, older web bundles) keep working unchanged.
   */
  fullName?: string;
  workspaceName?: string;
  workspaceSlug?: string;
};

export type WorkspaceDeletionPreview = {
  workspaceId: string;
  name: string;
  slug: string;
  documentCount: number;
  memberCount: number;
  pendingInviteCount: number;
  apiKeyCount: number;
  canDelete: boolean;
  reason?: "not_owner" | "last_workspace";
};

const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "paused"] as const;

async function resolveUniqueWorkspaceSlug(baseSlug: string) {
  const database = getDbOrThrow();
  const existing = await database
    .select({
      slug: workspaces.slug,
    })
    .from(workspaces)
    .where(eq(workspaces.slug, baseSlug));

  if (existing.length === 0) {
    return baseSlug;
  }

  let counter = 2;

  while (true) {
    const candidate = `${baseSlug}-${counter}`;
    const [match] = await database
      .select({
        slug: workspaces.slug,
      })
      .from(workspaces)
      .where(eq(workspaces.slug, candidate))
      .limit(1);

    if (!match) {
      return candidate;
    }

    counter += 1;
  }
}

export async function getViewerWorkspaceIds(viewerUserId?: string | null) {
  if (!viewerUserId) {
    return [];
  }

  const database = getDbOrThrow();
  const memberships = await database
    .select({
      workspaceId: workspaceMembers.workspaceId,
    })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, viewerUserId), eq(workspaceMembers.status, "active")));

  return memberships.map((membership) => membership.workspaceId);
}

/**
 * Workspaces where the user is an active owner or admin. They manage every
 * document there, including unpublished ones (offline to everyone else).
 */
export async function getManagedWorkspaceIds(userId?: string | null) {
  if (!userId) {
    return [];
  }

  const database = getDbOrThrow();
  const memberships = await database
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active"),
        inArray(workspaceMembers.role, ["owner", "admin"]),
      ),
    );

  return memberships.map((membership) => membership.workspaceId);
}

export function canViewerAccessPost(
  post: {
    visibility: "private" | "workspace" | "restricted_email" | "public";
    authorUserId: string;
    workspaceId: string;
  },
  viewerUserId: string | null | undefined,
  membershipWorkspaceIds: string[],
  /** When false, "public" posts are downgraded to workspace-only visibility. */
  workspaceAllowsPublic = true,
) {
  // The author can always see their own posts
  if (viewerUserId && post.authorUserId === viewerUserId) {
    return true;
  }

  // Workspace members can see workspace (and public) posts
  if (
    viewerUserId &&
    membershipWorkspaceIds.includes(post.workspaceId)
  ) {
    if (post.visibility === "workspace" || post.visibility === "public") {
      return true;
    }
  }

  // Public posts are only visible to outsiders when the workspace allows it
  if (post.visibility === "public" && workspaceAllowsPublic) {
    return true;
  }

  return false;
}

export async function getProfileSettings(userId: string) {
  const database = getDbOrThrow();
  const [record] = await database
    .select({
      username: usernames.username,
      fullName: usernames.fullName,
      bio: usernames.bio,
      profilePictureUrl: usernames.profilePictureUrl,
    })
    .from(usernames)
    .where(eq(usernames.userId, userId))
    .limit(1);

  return record ?? null;
}

export async function updateProfileSettings(
  userId: string,
  input: { fullName?: string | null; bio?: string | null; profilePictureUrl?: string | null },
) {
  const database = getDbOrThrow();

  // Partial update — only touch columns that were explicitly passed. Using
  // `?? null` on every field would wipe out the others when a caller only
  // wants to update, say, the avatar URL.
  const patch: Record<string, string | null> = {};
  if ("fullName" in input) patch.fullName = input.fullName ?? null;
  if ("bio" in input) patch.bio = input.bio ?? null;
  if ("profilePictureUrl" in input) {
    patch.profilePictureUrl = input.profilePictureUrl ?? null;
  }

  if (Object.keys(patch).length === 0) return;

  await database
    .update(usernames)
    .set(patch)
    .where(eq(usernames.userId, userId));
}

export async function getTeamInviteOnboardingDismissedAt(
  userId: string,
): Promise<Date | null> {
  const database = getDbOrThrow();
  const [record] = await database
    .select({
      dismissedAt: user.dismissedTeamInviteOnboardingAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return record?.dismissedAt ?? null;
}

export async function dismissTeamInviteOnboarding(
  userId: string,
): Promise<Date | null> {
  const database = getDbOrThrow();
  const dismissedAt = new Date();
  const [record] = await database
    .update(user)
    .set({
      dismissedTeamInviteOnboardingAt: dismissedAt,
      updatedAt: dismissedAt,
    })
    .where(eq(user.id, userId))
    .returning({
      dismissedAt: user.dismissedTeamInviteOnboardingAt,
    });

  return record?.dismissedAt ?? null;
}

/**
 * Update an existing user's username. Validates the new value against the
 * shared schema and reserved-slug list, ensures uniqueness across the
 * `usernames` table (excluding this user's own row so a no-op rename is a
 * no-op rather than an error), and writes both `username` and
 * `normalizedUsername` columns.
 *
 * Throws a tagged Error with a stable `code` so the calling route can
 * map back to a 4xx without leaking error-message text into the wire
 * format.
 */
export async function updateUsername(userId: string, rawUsername: string) {
  const database = getDbOrThrow();
  const normalized = normalizeUsername(rawUsername);
  const parsed = usernameSchema.safeParse(normalized);

  if (!parsed.success) {
    const err = new Error("Invalid username.") as Error & { code: string };
    err.code = "invalid_username";
    throw err;
  }

  if (RESERVED_USERNAMES.has(normalized)) {
    const err = new Error("That username is reserved.") as Error & { code: string };
    err.code = "reserved_username";
    throw err;
  }

  // Confirm the user already has a username row — we only support
  // *renames* here. Initial username assignment goes through
  // `completeOnboarding` so the workspace creation flow stays atomic.
  const [current] = await database
    .select({ id: usernames.id, normalizedUsername: usernames.normalizedUsername })
    .from(usernames)
    .where(eq(usernames.userId, userId))
    .limit(1);

  if (!current) {
    const err = new Error("No username found for this user.") as Error & { code: string };
    err.code = "no_username";
    throw err;
  }

  // No-op rename — return early without hitting the uniqueness check.
  if (current.normalizedUsername === normalized) return;

  const [conflict] = await database
    .select({ userId: usernames.userId })
    .from(usernames)
    .where(eq(usernames.normalizedUsername, normalized))
    .limit(1);

  if (conflict && conflict.userId !== userId) {
    const err = new Error("That username is already taken.") as Error & { code: string };
    err.code = "username_taken";
    throw err;
  }

  await database
    .update(usernames)
    .set({ username: normalized, normalizedUsername: normalized })
    .where(eq(usernames.userId, userId));
}

export async function getOnboardingState(userId: string) {
  const database = getDbOrThrow();
  const [usernameResults, workspaceResults] = await Promise.all([
    database
      .select()
      .from(usernames)
      .where(eq(usernames.userId, userId))
      .limit(1),
    database
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        defaultVisibility: workspaces.defaultVisibility,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, "active")))
      // The earliest-joined workspace, like `getUserWorkspaces` and the
      // CLI's login, so callers without a workspaceId always get the same one.
      .orderBy(workspaceMembers.joinedAt, workspaceMembers.workspaceId)
      .limit(1),
  ]);

  const usernameRecord = usernameResults[0];
  const workspaceRecord = workspaceResults[0];
  const defaultProject = workspaceRecord
    ? await ensureDefaultProjectForWorkspace(workspaceRecord.id)
    : null;

  return {
    hasUsername: Boolean(usernameRecord),
    hasWorkspace: Boolean(workspaceRecord),
    username: usernameRecord?.username ?? null,
    workspace: workspaceRecord
      ? { ...workspaceRecord, defaultProject }
      : null,
    completed: Boolean(usernameRecord && workspaceRecord),
  };
}

export async function completeOnboarding(input: OnboardingInput) {
  const database = getDbOrThrow();
  const normalizedUsername = normalizeUsername(input.username);
  const parsedUsername = usernameSchema.safeParse(normalizedUsername);

  if (!parsedUsername.success) {
    throw new Error("Invalid username.");
  }

  if (RESERVED_USERNAMES.has(normalizedUsername)) {
    throw new Error("That username is reserved.");
  }

  const [existingUsername] = await database
    .select()
    .from(usernames)
    .where(eq(usernames.normalizedUsername, normalizedUsername))
    .limit(1);

  if (existingUsername && existingUsername.userId !== input.userId) {
    throw new Error("That username is already taken.");
  }

  const [currentUsername] = await database
    .select()
    .from(usernames)
    .where(eq(usernames.userId, input.userId))
    .limit(1);

  const trimmedFullName = input.fullName?.trim() || null;

  await database.transaction(async (tx) => {
    if (!currentUsername) {
      await tx.insert(usernames).values({
        userId: input.userId,
        username: normalizedUsername,
        normalizedUsername,
        fullName: trimmedFullName,
      });
    } else if (trimmedFullName && !currentUsername.fullName) {
      // Re-running onboarding (e.g. invited user finishing setup) — fill
      // in the full name if it's still empty, but never overwrite a
      // value the user has already set.
      await tx
        .update(usernames)
        .set({ fullName: trimmedFullName })
        .where(eq(usernames.userId, input.userId));
    }

    const [existingMembership] = await tx
      .select({
        workspaceId: workspaceMembers.workspaceId,
      })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.userId, input.userId), eq(workspaceMembers.status, "active")))
      .limit(1);

    if (!existingMembership) {
      if (!input.workspaceName) {
        throw new Error("Workspace name is required for new accounts.");
      }

      // Use user-chosen slug when provided; fall back to auto-generation from
      // the workspace name for backwards compatibility (e.g. API callers that
      // haven't been updated yet).
      let workspaceSlug: string;

      if (input.workspaceSlug) {
        const normalized = normalizeWorkspaceSlug(input.workspaceSlug);
        const parsed = workspaceSlugSchema.safeParse(normalized);
        if (!parsed.success) {
          throw new Error("Invalid workspace ID.");
        }
        if (isReservedWorkspaceSlug(normalized)) {
          throw new Error("That workspace ID is reserved.");
        }
        const [existingSlug] = await tx
          .select({ slug: workspaces.slug })
          .from(workspaces)
          .where(eq(workspaces.slug, normalized))
          .limit(1);
        if (existingSlug) {
          throw new Error("That workspace ID is already taken.");
        }
        workspaceSlug = normalized;
      } else {
        workspaceSlug = await resolveUniqueWorkspaceSlug(createSlug(input.workspaceName));
      }
      const [workspaceRecord] = await tx
        .insert(workspaces)
        .values({
          name: input.workspaceName,
          slug: workspaceSlug,
          ownerUserId: input.userId,
          ...FREE_PLAN_EXPORT_DEFAULTS,
        })
        .returning({
          id: workspaces.id,
          slug: workspaces.slug,
        });

      await tx.insert(workspaceMembers).values({
        workspaceId: workspaceRecord.id,
        userId: input.userId,
        role: "owner",
        status: "active",
      });

      await tx.insert(projects).values({
        workspaceId: workspaceRecord.id,
        name: "Default",
        slug: "default",
        isDefault: true,
      });
    }
  });

  return getOnboardingState(input.userId);
}

export async function getDashboardData(userId: string, workspaceId?: string) {
  const database = getDbOrThrow();

  const [membershipWorkspaceIds, managedWorkspaceIds] = await Promise.all([
    getViewerWorkspaceIds(userId),
    getManagedWorkspaceIds(userId),
  ]);
  // Your own documents in any state; teammates' workspace and public ones
  // while published. Unpublished teammates' documents are offline, so only
  // owners and admins (who can delete them) still see them.
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
  const postConditions = [or(...accessClauses)!];
  if (workspaceId) {
    postConditions.push(eq(posts.workspaceId, workspaceId));
  }

  const [onboarding, postRecords] = await Promise.all([
    getOnboardingState(userId),
    database
      .select({
        id: posts.id,
        slug: posts.slug,
        title: posts.title,
        summary: posts.summary,
          visibility: posts.visibility,
          isPublished: posts.isPublished,
          publishedAt: posts.publishedAt,
          updatedAt: posts.updatedAt,
          workspaceSlug: workspaces.slug,
          projectId: projects.id,
          projectName: projects.name,
          projectSlug: projects.slug,
          isDefaultProject: projects.isDefault,
          // Agent that published the current version (X-OpenDocs-Client),
          // shown as "via Claude Code" in the documents table.
          client: sql<string | null>`${postVersions.sourceMetadata}->>'client'`,
        })
        .from(posts)
        .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
        .innerJoin(projects, eq(posts.projectId, projects.id))
        .leftJoin(postVersions, eq(posts.currentVersionId, postVersions.id))
        .where(and(...postConditions))
        .orderBy(desc(posts.updatedAt)),
  ]);

  const postList = !onboarding.workspace || !onboarding.username ? [] : postRecords;
  const tagsMap = await getTagsForPostIds(postList.map((p) => p.id));

  return {
    onboarding,
    posts: postList.map((p) => ({
      ...p,
      url: p.isDefaultProject
        ? `/${p.workspaceSlug}/${p.slug}`
        : `/${p.workspaceSlug}/projects/${p.projectSlug}/${p.slug}`,
      tags: tagsMap.get(p.id) ?? [],
    })),
  };
}

/**
 * Profile lookup for `opendocs.cc/{workspaceSlug}`.
 *
/**
 * Stable first-seen ordering of a workspace's tags.
 *
 * Returns a `tag → index` map where `index` is the rank of the tag by
 * `MIN(postTags.createdAt)` within the workspace — so "the first tag
 * ever used in this workspace is index 0, the second is index 1, …".
 * Ties on timestamp tiebreak by tag name (ascending) so the order is
 * deterministic across requests.
 *
 * Indices are consumed by `apps/web/lib/tag-colors.ts` to pick a color
 * for each tag chip; the modulo arithmetic happens there, not here.
 * If a post using tag X is deleted and X's earliest remaining postTag
 * row now has a later createdAt, X's index may shift — this is
 * acceptable drift for V1 since the common case (publish, maybe
 * delete a post later) doesn't touch tag ordering most of the time.
 *
 * Cheap query: groups `postTags` rows by tag after joining to posts
 * for the workspace filter. Indexed on `postTags.postId` and
 * `posts.workspaceId`.
 */
async function getWorkspaceTagOrderMap(
  workspaceId: string,
  projectId?: string,
): Promise<Record<string, number>> {
  const database = getDbOrThrow();
  const clauses = [eq(posts.workspaceId, workspaceId)];
  if (projectId) clauses.push(eq(posts.projectId, projectId));
  const rows = await database
    .select({
      tag: postTags.tag,
      firstSeen: sql<Date>`MIN(${postTags.createdAt})`.as("first_seen"),
    })
    .from(postTags)
    .innerJoin(posts, eq(postTags.postId, posts.id))
    .where(and(...clauses))
    .groupBy(postTags.tag)
    .orderBy(asc(sql`MIN(${postTags.createdAt})`), asc(postTags.tag));

  const map: Record<string, number> = {};
  rows.forEach((row, index) => {
    map[row.tag] = index;
  });
  return map;
}

/**
 * Visibility rules:
 * - `allowPublicDocuments === true`  → profile is public, anyone can view
 * - `allowPublicDocuments === false` → profile is private, only workspace members can view
 *
 * Returns `null` when the workspace doesn't exist.
 * Returns `{ private: true, workspaceSlug }` when it exists but the viewer has no access.
 */
export async function getProfileByWorkspaceSlugFromDb(
  workspaceSlugValue: string,
  viewerUserId?: string | null,
  /**
   * When provided, restricts the returned `posts` to just those carrying
   * the given tag (match is case-insensitive; tags are stored lowercased
   * at write time). The workspace header fields — name, bio, logo,
   * counts, etc. — are still scoped to the whole workspace so the tag
   * page can show the same hero that the root profile does.
   */
  tagFilter?: string | null,
  /**
   * Article ordering. The route layer resolves which value to pass
   * here from a three-tier cascade: URL `?sort=` override → workspace
   * `defaultSort` setting → `DEFAULT_POST_SORT`. We accept the
   * already-resolved value rather than re-deriving here so this
   * function stays free of HTTP / settings concerns.
   */
  sort?: PostSort,
  projectSlug?: string | null,
): Promise<
  | null
  | { private: true; workspaceSlug: string }
  | {
      private: false;
      workspaceId: string;
      workspaceSlug: string;
      workspaceName: string;
      username: string | null;
      displayName: string;
      bio: string | null;
      logoUrl: string | null;
      allowPublicDocuments: boolean;
      createdAt: string;
      /**
       * The workspace's stored default article sort. Callers (the
       * route layer) use this as the second tier of the sort
       * cascade — URL override wins, otherwise this, otherwise the
       * global `DEFAULT_POST_SORT`.
       */
      defaultSort: PostSort;
      scope: "workspace" | "project";
      project: {
        id: string;
        slug: string;
        name: string;
        isDefault: boolean;
        path: string;
      };
      projects: Array<{
        id: string;
        slug: string;
        name: string;
        isDefault: boolean;
        path: string;
        postCount: number;
      }>;
      posts: Array<{
        workspaceSlug: string;
        projectSlug: string;
        projectName: string;
        isDefaultProject: boolean;
        url: string;
        tagBasePath: string;
        slug: string;
        title: string;
        summary: string;
        updatedAt: string;
        updatedAtIso: string;
        updatedAtIsRecent: boolean;
        readingTime: string;
        tags: string[];
      }>;
      /**
       * Workspace-scoped, first-seen ordering of tags → integer index.
       * Consumers (profile page, article page, sidebar cloud) look up a
       * tag chip's color by this index. See `getWorkspaceTagOrderMap`.
       */
      tagColorIndex: Record<string, number>;
    }
> {
  const database = getDbOrThrow();
  const normalized = normalizeWorkspaceSlug(workspaceSlugValue);

  const [workspace] = await database
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      bio: workspaces.bio,
      logoUrl: workspaces.logoUrl,
      allowPublicDocuments: workspaces.allowPublicDocuments,
      defaultSort: workspaces.defaultSort,
      ownerUserId: workspaces.ownerUserId,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .where(eq(workspaces.slug, normalized))
    .limit(1);

  if (!workspace) {
    return null;
  }

  const normalizedProjectSlug = projectSlug?.trim().toLowerCase() || null;
  const [project] = await database
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      isDefault: projects.isDefault,
    })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspace.id),
        normalizedProjectSlug
          ? eq(projects.slug, normalizedProjectSlug)
          : eq(projects.isDefault, true),
      ),
    )
    .limit(1);

  if (!project) {
    return null;
  }
  const selectedProjectId = normalizedProjectSlug ? project.id : undefined;
  const scope = selectedProjectId ? "project" : "workspace";

  const membershipWorkspaceIds = await getViewerWorkspaceIds(viewerUserId);
  const viewerIsMember = membershipWorkspaceIds.includes(workspace.id);

  // Private workspace — only members can see the profile
  if (!workspace.allowPublicDocuments && !viewerIsMember) {
    return { private: true, workspaceSlug: workspace.slug };
  }

  // Fetch profile chrome data and project counts in parallel. Counts are
  // intentionally tag-independent so the project switcher remains a stable
  // workspace map even while the article list is filtered by a topic.
  const [ownerProfile, projectRecords, projectCountPosts] = await Promise.all([
    database
      .select({
        username: usernames.username,
      })
      .from(usernames)
      .where(eq(usernames.userId, workspace.ownerUserId))
      .limit(1)
      .then((rows) => rows[0]),
    database
      .select({
        id: projects.id,
        slug: projects.slug,
        name: projects.name,
        isDefault: projects.isDefault,
      })
      .from(projects)
      .where(eq(projects.workspaceId, workspace.id))
      .orderBy(desc(projects.isDefault), asc(projects.name)),
    database
      .select({
        projectId: posts.projectId,
        workspaceId: posts.workspaceId,
        authorUserId: posts.authorUserId,
        visibility: posts.visibility,
        updatedAt: posts.updatedAt,
      })
      .from(posts)
      .where(and(eq(posts.workspaceId, workspace.id), eq(posts.isPublished, true))),
  ]);

  const projectPostCounts = new Map<string, number>();
  const projectLastActivity = new Map<string, Date>();
  for (const post of projectCountPosts) {
    if (
      canViewerAccessPost(
        post,
        viewerUserId,
        membershipWorkspaceIds,
        workspace.allowPublicDocuments,
      )
    ) {
      projectPostCounts.set(
        post.projectId,
        (projectPostCounts.get(post.projectId) ?? 0) + 1,
      );
      const currentLatest = projectLastActivity.get(post.projectId);
      if (!currentLatest || post.updatedAt > currentLatest) {
        projectLastActivity.set(post.projectId, post.updatedAt);
      }
    }
  }

  // Branch on the tag filter: the join shape differs enough that mixing
  // them via a dynamic builder would fight Drizzle's type inference.
  // Posts store their tags in a separate `postTags` table, so filtering
  // is an INNER JOIN with an equality on the lowercased tag string.
  const normalizedTag = tagFilter?.trim().toLowerCase() || null;

  // Resolve the order-by clause once. The function-level `sort`
  // arg wins; otherwise we use the workspace's stored default
  // (set in workspace settings); otherwise fall through to the
  // global default. `title-*` sorts add a stable tiebreaker on
  // `updatedAt` so duplicate-titled posts (rare but possible)
  // don't shuffle between page loads. Date sorts already have
  // microsecond resolution so they don't need a tiebreaker in
  // practice. The DB column is a varchar; we re-validate via
  // `parsePostSort` so a hand-edited row with a junk value
  // degrades gracefully to the global default rather than 500-ing.
  const workspaceDefault =
    parsePostSort(workspace.defaultSort) ?? DEFAULT_POST_SORT;
  const resolvedSort = sort ?? workspaceDefault;
  const orderClause = (() => {
    switch (resolvedSort) {
      case "recently-added":
        return [desc(posts.publishedAt)];
      case "title-asc":
        return [asc(posts.title), desc(posts.updatedAt)];
      case "title-desc":
        return [desc(posts.title), desc(posts.updatedAt)];
      case "recently-updated":
      default:
        return [desc(posts.updatedAt)];
    }
  })();

  const publishedPosts = normalizedTag
    ? await database
        .select({
          id: posts.id,
          slug: posts.slug,
          title: posts.title,
          summary: posts.summary,
          updatedAt: posts.updatedAt,
          workspaceId: posts.workspaceId,
          authorUserId: posts.authorUserId,
          visibility: posts.visibility,
          projectId: projects.id,
          projectName: projects.name,
          projectSlug: projects.slug,
          isDefaultProject: projects.isDefault,
          rawMarkdown: postVersions.rawMarkdown,
        })
        .from(posts)
        .leftJoin(postVersions, eq(posts.currentVersionId, postVersions.id))
        .innerJoin(projects, eq(posts.projectId, projects.id))
        .innerJoin(postTags, eq(postTags.postId, posts.id))
        .where(
          and(
            eq(posts.workspaceId, workspace.id),
            ...(selectedProjectId ? [eq(posts.projectId, selectedProjectId)] : []),
            eq(posts.isPublished, true),
            eq(postTags.tag, normalizedTag),
          ),
        )
        .orderBy(...orderClause)
    : await database
        .select({
          id: posts.id,
          slug: posts.slug,
          title: posts.title,
          summary: posts.summary,
          updatedAt: posts.updatedAt,
          workspaceId: posts.workspaceId,
          authorUserId: posts.authorUserId,
          visibility: posts.visibility,
          projectId: projects.id,
          projectName: projects.name,
          projectSlug: projects.slug,
          isDefaultProject: projects.isDefault,
          rawMarkdown: postVersions.rawMarkdown,
        })
        .from(posts)
        .leftJoin(postVersions, eq(posts.currentVersionId, postVersions.id))
        .innerJoin(projects, eq(posts.projectId, projects.id))
        .where(
          and(
            eq(posts.workspaceId, workspace.id),
            ...(selectedProjectId ? [eq(posts.projectId, selectedProjectId)] : []),
            eq(posts.isPublished, true),
          ),
        )
        .orderBy(...orderClause);

  const visiblePosts = publishedPosts.filter((post) => {
    return canViewerAccessPost(post, viewerUserId, membershipWorkspaceIds, workspace.allowPublicDocuments);
  });

  // Fire the tag-order lookup alongside the per-post tags fetch — both
  // hit the `postTags` table but with very different aggregations, so
  // running them in parallel shaves a round-trip off the profile render.
  const [tagsMap, tagColorIndex] = await Promise.all([
    getTagsForPostIds(visiblePosts.map((p) => p.id)),
    getWorkspaceTagOrderMap(workspace.id, selectedProjectId),
  ]);
  const projectPath = scope === "workspace"
    ? `/${workspace.slug}`
    : `/${workspace.slug}/projects/${project.slug}`;
  const activeTagBasePath = scope === "workspace"
    ? `/${workspace.slug}/tag`
    : `${projectPath}/tag`;

  return {
    private: false,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    workspaceName: workspace.name,
    username: ownerProfile?.username ?? null,
    displayName: workspace.name,
    bio: workspace.bio ?? null,
    logoUrl: workspace.logoUrl ?? null,
    allowPublicDocuments: workspace.allowPublicDocuments,
    createdAt: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(workspace.createdAt),
    defaultSort: workspaceDefault,
    scope,
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
      isDefault: project.isDefault,
      path: projectPath,
    },
    projects: projectRecords
      .map((record) => ({
        id: record.id,
        slug: record.slug,
        name: record.name,
        isDefault: record.isDefault,
        path: `/${workspace.slug}/projects/${record.slug}`,
        postCount: projectPostCounts.get(record.id) ?? 0,
        lastActivityAt: projectLastActivity.get(record.id) ?? null,
      }))
      .sort((a, b) => {
        // Small workspaces are easiest to scan with Default first and
        // alphabetical names. Once the list is long, order by recent
        // document activity so the projects people are actively using
        // stay near the top of the switcher.
        if (projectRecords.length <= 7) return 0;
        const aTime = a.lastActivityAt?.getTime() ?? 0;
        const bTime = b.lastActivityAt?.getTime() ?? 0;
        if (aTime !== bTime) return bTime - aTime;
        return a.name.localeCompare(b.name);
      })
      .map(({ lastActivityAt: _lastActivityAt, ...record }) => record),
    tagColorIndex,
    posts: visiblePosts.map((post) => {
      const RECENT_PROFILE_WINDOW_MS = 48 * 60 * 60 * 1000;
      const wordCount = (post.rawMarkdown ?? "").split(/\s+/).filter(Boolean).length;
      const minutes = Math.max(1, Math.round(wordCount / 230));
      const isRecent =
        Date.now() - post.updatedAt.getTime() < RECENT_PROFILE_WINDOW_MS;
      const dateOnly = new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(post.updatedAt);
      const updatedAt = isRecent
        ? `${dateOnly} at ${new Intl.DateTimeFormat("en-US", {
            timeStyle: "short",
            timeZone: "UTC",
          }).format(post.updatedAt)} UTC`
        : dateOnly;

      // Regenerate the excerpt from raw Markdown on every read. The
      // stored `posts.summary` was produced by a much dumber extractor
      // before — many older rows still contain document-control table
      // rows ("| Status | Approved |"), image syntax ("![banner](...)"),
      // or H1 titles. Regenerating here means the workspace profile
      // looks good for every post, old and new, without a backfill.
      // Falls back to the stored summary if the raw markdown isn't
      // joined (shouldn't happen — every post has a currentVersionId —
      // but be defensive).
      const excerpt = post.rawMarkdown
        ? extractMarkdownExcerpt(post.rawMarkdown)
        : (post.summary ?? "");

      return {
        workspaceSlug: workspace.slug,
        projectSlug: post.projectSlug,
        projectName: post.projectName,
        isDefaultProject: post.isDefaultProject,
        url: post.isDefaultProject
          ? `/${workspace.slug}/${post.slug}`
          : `/${workspace.slug}/projects/${post.projectSlug}/${post.slug}`,
        tagBasePath: activeTagBasePath,
        slug: post.slug,
        title: post.title,
        summary: excerpt,
        updatedAt,
        updatedAtIso: post.updatedAt.toISOString(),
        updatedAtIsRecent: isRecent,
        readingTime: `${minutes} min read`,
        tags: tagsMap.get(post.id) ?? [],
      };
    }),
  };
}

/**
 * Public access check for the server-side download endpoint.
 *
 * Given a viewer's user ID (or null for anonymous) and a post's
 * identity fields, returns `true` when the viewer is allowed to
 * download the post. Mirrors exactly the rules that
 * `getPostByWorkspaceSlugAndPostSlug` applies for rendering the
 * article page, so the button that renders on-page always works:
 *   - The post's author can always download.
 *   - Workspace members can download workspace + public posts.
 *   - Anonymous visitors can download only when the post is
 *     `visibility: "public"` AND the workspace has
 *     `allowPublicDocuments: true`.
 *
 * This is async because we need to fetch the viewer's workspace
 * memberships. Callers who already have the memberships in hand can
 * bypass this helper and call `canViewerAccessPost` directly.
 */
export async function canUserDownloadPost(
  viewerUserId: string | null | undefined,
  post: {
    /** When present, guest shares (posts/sharing.ts) are also honored. */
    id?: string;
    visibility: "private" | "workspace" | "restricted_email" | "public";
    authorUserId: string;
    workspaceId: string;
  },
  workspaceAllowsPublic: boolean,
): Promise<boolean> {
  const membershipWorkspaceIds = await getViewerWorkspaceIds(viewerUserId);
  if (
    canViewerAccessPost(
      post,
      viewerUserId,
      membershipWorkspaceIds,
      workspaceAllowsPublic,
    )
  ) {
    return true;
  }
  return post.id ? isPostSharedWithViewer(post.id, viewerUserId) : false;
}

export async function getPostByWorkspaceSlugAndPostSlug(
  workspaceSlugValue: string,
  slugValue: string,
  viewerUserId?: string | null,
  projectSlugValue?: string | null,
) {
  const database = getDbOrThrow();
  const normalized = normalizeWorkspaceSlug(workspaceSlugValue);
  const membershipWorkspaceIds = await getViewerWorkspaceIds(viewerUserId);

  const [record] = await database
    .select({
      id: posts.id,
      workspaceSlug: workspaces.slug,
      workspaceName: workspaces.name,
      workspaceLogoUrl: workspaces.logoUrl,
      workspaceOwnerUserId: workspaces.ownerUserId,
      allowPublicDocuments: workspaces.allowPublicDocuments,
      projectId: projects.id,
      projectSlug: projects.slug,
      projectName: projects.name,
      isDefaultProject: projects.isDefault,
      slug: posts.slug,
      title: posts.title,
      summary: posts.summary,
      publishedAt: posts.publishedAt,
      updatedAt: posts.updatedAt,
      visibility: posts.visibility,
      workspaceId: posts.workspaceId,
      authorUserId: posts.authorUserId,
      versionId: postVersions.id,
      rawMarkdown: postVersions.rawMarkdown,
      renderedHtml: postVersions.renderedHtml,
      toc: postVersions.toc,
      sourceMetadata: postVersions.sourceMetadata,
      versionNumber: postVersions.versionNumber,
    })
    .from(posts)
    .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
    .innerJoin(projects, eq(posts.projectId, projects.id))
    .innerJoin(postVersions, eq(posts.currentVersionId, postVersions.id))
    .where(
      and(
        eq(workspaces.slug, normalized),
        projectSlugValue
          ? eq(projects.slug, projectSlugValue)
          : eq(projects.isDefault, true),
        eq(posts.slug, slugValue),
        eq(posts.isPublished, true),
      ),
    )
    .limit(1);

  if (!record) {
    return null;
  }

  if (
    !canViewerAccessPost(record, viewerUserId, membershipWorkspaceIds, record.allowPublicDocuments) &&
    !(await isPostSharedWithViewer(record.id, viewerUserId))
  ) {
    return null;
  }

  const [ownerProfile] = await database
    .select({ username: usernames.username })
    .from(usernames)
    .where(eq(usernames.userId, record.workspaceOwnerUserId))
    .limit(1);

  // Parallel: per-post tag list + workspace-wide tag ordering + the
  // workspace's plan. The article page uses the ordering to color chips the
  // same way the workspace profile does, so a tag keeps its color
  // whether you see it in the sidebar cloud, on a card, or above an
  // article title. The tier is used to gate the DOCX download button —
  // we key on the WORKSPACE's plan (not the viewer's) because downloads
  // are a feature the workspace offers to readers, same as custom
  // branding.
  const [tags, tagColorIndex, workspaceTier, rendering] = await Promise.all([
    getTagsForPost(record.id),
    getWorkspaceTagOrderMap(record.workspaceId, record.projectId),
    getEffectiveWorkspaceTier(record.workspaceId),
    currentRendering(record),
  ]);
  const canExportDocx = (workspaceTier ?? "free") !== "free";

  // Regenerate from raw markdown so the OpenGraph / meta description
  // on the post page is clean even for posts published before the
  // excerpt extractor was fixed. See the matching comment in
  // `getProfileByWorkspaceSlugFromDb`.
  const excerpt = record.rawMarkdown
    ? extractMarkdownExcerpt(record.rawMarkdown)
    : (record.summary ?? "");

  // Reading time — consistent with profile post cards.
  const wordCount = (record.rawMarkdown ?? "").split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.round(wordCount / 230));

  // True when the viewer is an active member of the post's workspace.
  // Used to gate the in-article commenting affordance: workspace
  // members can highlight + comment; outside readers cannot. Even
  // public posts only accept comments from workspace members — public
  // commenting is intentionally not in scope, see the schema header.
  const canComment = Boolean(
    viewerUserId && membershipWorkspaceIds.includes(record.workspaceId),
  );

  return {
    id: record.id,
    workspaceId: record.workspaceId,
    workspaceSlug: record.workspaceSlug,
    workspaceName: record.workspaceName,
    workspaceLogoUrl: record.workspaceLogoUrl ?? null,
    /**
     * Readable by anyone: visibility public in a workspace that allows
     * public documents. Public pages of a workspace with a custom domain
     * live on that domain; everything else stays on opendocs.cc.
     */
    isPublic: record.visibility === "public" && record.allowPublicDocuments,
    ownerUsername: ownerProfile?.username ?? null,
    projectId: record.projectId,
    projectSlug: record.projectSlug,
    projectName: record.projectName,
    isDefaultProject: record.isDefaultProject,
    url: record.isDefaultProject
      ? `/${record.workspaceSlug}/${record.slug}`
      : `/${record.workspaceSlug}/projects/${record.projectSlug}/${record.slug}`,
    slug: record.slug,
    title: record.title,
    summary: excerpt,
    canComment,
    updatedAt: new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
    }).format(record.updatedAt),
    /**
     * Age-aware "Last updated" trailer string shown at the bottom of
     * the article. For posts updated within the last 2 weeks this
     * reads "April 19, 2026 at 3:45 PM UTC" — the extra precision is
     * useful while readers are still tracking doc freshness. Once a
     * post has settled past that window we drop the time and show
     * just "April 19, 2026" — the day is enough context for an
     * archival doc and the trailer stays visually lighter.
     *
     * This is the SERVER render — always in UTC with `"UTC"` spelled
     * out. The client component (`<LastUpdatedTrailer>`) swaps it for
     * a browser-locale formatted version on mount, so US readers see
     * 12h time in their local TZ and European readers see 24h time.
     * We keep this server string as the SSR fallback for crawlers and
     * JS-disabled clients, and as the initial paint before hydration.
     *
     * Formatted in UTC (with the suffix hardcoded) so the SSR string
     * is identical across dev machines and production — otherwise
     * the server's local timezone would leak through and produce
     * different strings per deployment.
     *
     * Note: `dateStyle`/`timeStyle` cannot be combined with
     * `timeZoneName` in `Intl.DateTimeFormat` (it throws), which is
     * why we run two separate formatters and concatenate the " UTC"
     * suffix as a plain string instead.
     */
    updatedAtDisplay: (() => {
      const RECENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
      const dateOnly = new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(record.updatedAt);
      const isRecent =
        Date.now() - record.updatedAt.getTime() < RECENT_WINDOW_MS;
      if (!isRecent) return dateOnly;
      const timeOnly = new Intl.DateTimeFormat("en-US", {
        timeStyle: "short",
        timeZone: "UTC",
      }).format(record.updatedAt);
      return `${dateOnly} at ${timeOnly} UTC`;
    })(),
    /**
     * Raw ISO-8601 timestamp of the last edit. Passed to the client
     * trailer so the browser can reformat in the viewer's own locale
     * (12h vs 24h) and local timezone. Server stays locale-agnostic.
     */
    updatedAtIso: record.updatedAt.toISOString(),
    /**
     * Raw ISO-8601 timestamp of when this post was first published —
     * used for `article:published_time` OG / Article JSON-LD schema so
     * search engines can show "posted 3 days ago" style recency on
     * doc pages. Distinct from `updatedAtIso`, which tracks edits.
     */
    publishedAtIso: record.publishedAt.toISOString(),
    /**
     * True when the post was updated within the last 2 weeks. The
     * client trailer keys off this flag: recent → reformat in the
     * browser's locale (date + time); older → keep the server's
     * date-only string as-is since there's no time to localize.
     * Computed here (server) instead of on the client so the threshold
     * stays in one place and the client doesn't need `Date.now()`
     * fiddling that could re-render near the boundary.
     */
    updatedAtIsRecent:
      Date.now() - record.updatedAt.getTime() < 14 * 24 * 60 * 60 * 1000,
    readingTime: `${readingMinutes} min read`,
    renderedHtml: normalizeStoredRenderedHtml(rendering.renderedHtml),
    /** Headings of the current version, for the article's table of contents. */
    toc: rendering.toc,
    /** Number of the live version (1-based). */
    versionNumber: record.versionNumber,
    visibility: record.visibility,
    tags,
    tagColorIndex,
    /**
     * Whether the "Download DOCX" button should render on this post's
     * article page. Pro/Team owners → true; Free owners → false.
     * PDF downloads are always available (no gating).
     */
    canExportDocx,
  };
}

/**
 * Lightweight existence + access probe for a published post.
 *
 * Called from the article page ONLY when the full fetch returned
 * null, to distinguish "this post doesn't exist" from "this post
 * exists but the current viewer can't see it". The former becomes a
 * 404; the latter renders a "sign in to access" page with a
 * redirect-back URL, so logged-out readers clicking a private link
 * land somewhere useful instead of a generic not-found.
 *
 * Kept deliberately cheap: a single indexed lookup, no joins on
 * version/tag tables, no markdown rendering. Fine to call on the
 * cold path since accessible posts never reach it.
 */
export async function getPostAccessState(
  workspaceSlugValue: string,
  slugValue: string,
  viewerUserId?: string | null,
  projectSlugValue?: string | null,
): Promise<"not_found" | "accessible" | "restricted"> {
  const database = getDbOrThrow();
  const normalized = normalizeWorkspaceSlug(workspaceSlugValue);

  const [record] = await database
    .select({
      id: posts.id,
      visibility: posts.visibility,
      authorUserId: posts.authorUserId,
      workspaceId: posts.workspaceId,
      allowPublicDocuments: workspaces.allowPublicDocuments,
    })
    .from(posts)
    .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
    .innerJoin(projects, eq(posts.projectId, projects.id))
    .where(
      and(
        eq(workspaces.slug, normalized),
        projectSlugValue
          ? eq(projects.slug, projectSlugValue)
          : eq(projects.isDefault, true),
        eq(posts.slug, slugValue),
        eq(posts.isPublished, true),
      ),
    )
    .limit(1);

  if (!record) {
    return "not_found";
  }

  const membershipWorkspaceIds = await getViewerWorkspaceIds(viewerUserId);
  const accessible =
    canViewerAccessPost(
      record,
      viewerUserId,
      membershipWorkspaceIds,
      record.allowPublicDocuments,
    ) || (await isPostSharedWithViewer(record.id, viewerUserId));
  return accessible ? "accessible" : "restricted";
}

/**
 * Fetches posts in the same workspace that share at least one tag
 * with the given post, respecting the viewer's access (same rules
 * as the workspace profile page). Used by the article page's
 * "Related documents" section so readers can hop between articles
 * in the same subject area without having to bounce back to the
 * workspace profile.
 *
 * Returns an empty array when the workspace doesn't exist, when
 * `tags` is empty, or when no other post matches. The caller is
 * expected to check `posts.length === 0` and skip rendering the
 * section entirely in that case.
 *
 * `limit` caps how many matches we return — we deliberately
 * over-fetch relative to the client's initial "show 7" cut so the
 * "Load more" button has room to reveal additional batches without
 * another round-trip.
 */
export async function getRelatedPostsByTags(args: {
  workspaceSlug: string;
  projectSlug?: string | null;
  /** Slug of the post to exclude from the result (the one the viewer is reading). */
  excludePostSlug: string;
  /** Tags of the current post. Empty array → returns empty posts. */
  tags: string[];
  viewerUserId?: string | null;
  /** Upper bound on total matches returned. Defaults to 25. */
  limit?: number;
}): Promise<{
  posts: Array<{
    workspaceSlug: string;
    projectSlug: string;
    isDefaultProject: boolean;
    url: string;
    tagBasePath: string;
    slug: string;
    title: string;
    updatedAt: string;
    readingTime: string;
    tags: string[];
  }>;
}> {
  const { workspaceSlug, projectSlug, excludePostSlug, tags, viewerUserId, limit = 25 } = args;
  if (tags.length === 0) {
    return { posts: [] };
  }

  const database = getDbOrThrow();
  const normalized = normalizeWorkspaceSlug(workspaceSlug);
  const membershipWorkspaceIds = await getViewerWorkspaceIds(viewerUserId);

  // Single join across posts + workspaces + postVersions + postTags.
  // The postTags join intentionally produces one row per matching tag,
  // so a post that shares multiple tags with the current one will
  // appear multiple times in `rows` — we dedupe below. It's cheaper
  // than forcing `GROUP BY posts.id` + aggregating every column.
  const rows = await database
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      updatedAt: posts.updatedAt,
      visibility: posts.visibility,
      workspaceId: posts.workspaceId,
      authorUserId: posts.authorUserId,
      workspaceSlug: workspaces.slug,
      projectSlug: projects.slug,
      isDefaultProject: projects.isDefault,
      allowPublicDocuments: workspaces.allowPublicDocuments,
      rawMarkdown: postVersions.rawMarkdown,
    })
    .from(posts)
    .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
    .innerJoin(projects, eq(posts.projectId, projects.id))
    .leftJoin(postVersions, eq(posts.currentVersionId, postVersions.id))
    .innerJoin(postTags, eq(postTags.postId, posts.id))
    .where(
      and(
        eq(workspaces.slug, normalized),
        projectSlug
          ? eq(projects.slug, projectSlug)
          : eq(projects.isDefault, true),
        eq(posts.isPublished, true),
        inArray(postTags.tag, tags),
      ),
    )
    .orderBy(desc(posts.updatedAt));

  // Dedupe by post id, drop the current post, and apply access control.
  // Order is preserved from the query (updatedAt DESC).
  const seen = new Set<string>();
  const visible: typeof rows = [];
  for (const row of rows) {
    if (row.slug === excludePostSlug) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (
      !canViewerAccessPost(
        row,
        viewerUserId,
        membershipWorkspaceIds,
        row.allowPublicDocuments,
      )
    ) {
      continue;
    }
    visible.push(row);
    if (visible.length >= limit) break;
  }

  if (visible.length === 0) {
    return { posts: [] };
  }

  const tagsMap = await getTagsForPostIds(visible.map((p) => p.id));

  return {
    posts: visible.map((post) => {
      const wordCount = (post.rawMarkdown ?? "")
        .split(/\s+/)
        .filter(Boolean).length;
      const minutes = Math.max(1, Math.round(wordCount / 230));
      return {
        workspaceSlug: post.workspaceSlug,
        projectSlug: post.projectSlug,
        isDefaultProject: post.isDefaultProject,
        url: post.isDefaultProject
          ? `/${post.workspaceSlug}/${post.slug}`
          : `/${post.workspaceSlug}/projects/${post.projectSlug}/${post.slug}`,
        tagBasePath: post.isDefaultProject
          ? `/${post.workspaceSlug}/tag`
          : `/${post.workspaceSlug}/projects/${post.projectSlug}/tag`,
        slug: post.slug,
        title: post.title,
        updatedAt: new Intl.DateTimeFormat("en-US", {
          dateStyle: "long",
        }).format(post.updatedAt),
        readingTime: `${minutes} min read`,
        tags: tagsMap.get(post.id) ?? [],
      };
    }),
  };
}

/**
 * Compact per-workspace search index, used by the `<WorkspaceSearch>`
 * client dialog. Keyed entirely off data already on `posts` / `postTags`
 * / `workspaces` — no Postgres full-text search, no GIN indexes, no new
 * schema. Matches the design decision to reuse the existing backend and
 * optimize the *shape* of the payload instead of the search algorithm.
 *
 * ## Why this shape
 *
 * We deliberately ship only `{title, summary, tags}` as match targets,
 * plus `{slug, updatedAt, workspaceSlug}` as metadata. No section text,
 * no rendered HTML, no body dump.
 *
 * For 1000 docs this comes out to ~400 KB raw / ~80 KB gzipped — fine
 * to fetch on-demand when the user opens the dialog, cache in memory
 * for the rest of the session, and search synchronously on every
 * keystroke (<5 ms over 1000 entries).
 *
 * ## Scale ceiling
 *
 * This approach is comfortable up to ~5-10k docs. Beyond that the
 * payload starts to hurt (a ~2 MB gzipped JSON blob is a noticeable
 * open-dialog latency even on a fast connection) and the client-side
 * linear scan starts to stutter. At that scale we'd move to a
 * server-side search endpoint backed by a Postgres `tsvector` GIN
 * index — at which point this function gets replaced rather than
 * extended. Documented here so whoever hits the ceiling doesn't have
 * to re-derive the reasoning.
 *
 * ## What we don't index
 *
 * - Document body beyond the summary. Readers whose terms only appear
 *   deep in a doc body won't get a match. Title/summary/tags covers
 *   the common case; body-text search is a later addition if demand
 *   shows up.
 * - Tags the current viewer can't see. Access-filtering is done via
 *   `canViewerAccessPost`, same rules as the profile page.
 */
export async function getWorkspaceSearchIndex(
  workspaceSlugValue: string,
  viewerUserId?: string | null,
): Promise<{
  items: Array<{
    slug: string;
    url: string;
    title: string;
    summary: string;
    tags: string[];
    /** Formatted date (e.g. "April 19, 2026"). */
    updatedAt: string;
    workspaceSlug: string;
    /** Project name, or null for the workspace's default project. */
    projectName: string | null;
    /** H2/H3 headings, so search can jump straight to a section. */
    headings: Array<{ id: string; text: string }>;
    /** Plain-text start of the body, capped at SEARCH_BODY_CHARS. */
    body: string;
  }>;
  /**
   * Workspace-wide tag → palette index, so the result rows can color
   * their tag chips the same way the profile page and article header
   * do. See `lib/tag-colors.ts`.
   */
  tagColorIndex: Record<string, number>;
}> {
  const database = getDbOrThrow();
  const normalized = normalizeWorkspaceSlug(workspaceSlugValue);
  const membershipWorkspaceIds = await getViewerWorkspaceIds(viewerUserId);

  const [workspace] = await database
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      allowPublicDocuments: workspaces.allowPublicDocuments,
    })
    .from(workspaces)
    .where(eq(workspaces.slug, normalized))
    .limit(1);

  if (!workspace) {
    return { items: [], tagColorIndex: {} };
  }

  // Pull `rawMarkdown` so we can regenerate a summary on the fly for
  // legacy posts whose stored `summary` column was populated before
  // the excerpt extractor was fixed. Same fallback as
  // `getPostByWorkspaceSlugAndPostSlug` — keeps snippets clean for
  // old docs without a migration.
  const records = await database
    .select({
      id: posts.id,
      slug: posts.slug,
      projectSlug: projects.slug,
      projectName: projects.name,
      isDefaultProject: projects.isDefault,
      title: posts.title,
      summary: posts.summary,
      updatedAt: posts.updatedAt,
      visibility: posts.visibility,
      workspaceId: posts.workspaceId,
      authorUserId: posts.authorUserId,
      rawMarkdown: postVersions.rawMarkdown,
      toc: postVersions.toc,
    })
    .from(posts)
    .leftJoin(postVersions, eq(posts.currentVersionId, postVersions.id))
    .innerJoin(projects, eq(posts.projectId, projects.id))
    .where(
      and(
        eq(posts.workspaceId, workspace.id),
        eq(posts.isPublished, true),
      ),
    )
    .orderBy(desc(posts.updatedAt));

  const visibleRecords = records.filter((record) =>
    canViewerAccessPost(
      record,
      viewerUserId,
      membershipWorkspaceIds,
      workspace.allowPublicDocuments,
    ),
  );

  if (visibleRecords.length === 0) {
    return { items: [], tagColorIndex: {} };
  }

  // Parallel: tag map for just the surviving posts, plus the
  // workspace-wide tag color index. Not batched into the main query
  // because tags are 1:N and we'd dedupe rows either way; this is
  // cleaner.
  const [tagsMap, tagColorIndex] = await Promise.all([
    getTagsForPostIds(visibleRecords.map((r) => r.id)),
    getWorkspaceTagOrderMap(workspace.id),
  ]);

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
  });

  return {
    items: visibleRecords.map((record) => ({
      slug: record.slug,
      url: record.isDefaultProject
        ? `/${workspace.slug}/${record.slug}`
        : `/${workspace.slug}/projects/${record.projectSlug}/${record.slug}`,
      title: record.title,
      // Prefer the pre-computed summary; fall back to deriving one
      // from the raw markdown for legacy posts. Empty string if both
      // are missing — the UI treats empty summaries as "no snippet".
      summary:
        record.summary?.trim() ||
        (record.rawMarkdown ? extractMarkdownExcerpt(record.rawMarkdown) : ""),
      tags: tagsMap.get(record.id) ?? [],
      updatedAt: dateFormatter.format(record.updatedAt),
      workspaceSlug: workspace.slug,
      projectName: record.isDefaultProject ? null : record.projectName,
      headings: (record.toc ?? [])
        .filter((heading) => heading.level === 2 || heading.level === 3)
        .slice(0, 40)
        .map((heading) => ({ id: heading.id, text: heading.text })),
      body: record.rawMarkdown ? markdownToSearchText(record.rawMarkdown) : "",
    })),
    tagColorIndex,
  };
}

/**
 * Body text carried in the search index. Capped so the index stays small
 * (a 1,000-document workspace stays around 2 MB before gzip); headings and
 * summaries cover the rest of a long document.
 */
const SEARCH_BODY_CHARS = 2000;

/**
 * Rough Markdown → plain text for search matching and snippets. The index
 * goes to every reader, so ```private blocks stay out, as on the page.
 */
function markdownToSearchText(markdown: string): string {
  return stripPrivateBlocks(markdown)
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, " ")
    .replace(/[`*_~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_BODY_CHARS);
}

// ---- Workspace settings ----

export async function getWorkspaceSettings(userId: string, workspaceId?: string) {
  const database = getDbOrThrow();

  const memberConditions = [
    eq(workspaceMembers.userId, userId),
    eq(workspaceMembers.status, "active"),
  ];
  if (workspaceId) {
    memberConditions.push(eq(workspaceMembers.workspaceId, workspaceId));
  }

  // Without a workspaceId: the earliest-joined active membership (see
  // `getOnboardingState`).
  const [membership] = await database
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .where(and(...memberConditions))
    .orderBy(workspaceMembers.joinedAt, workspaceMembers.workspaceId)
    .limit(1);

  if (!membership) return null;

  const [workspace] = await database
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      plan: workspaces.plan,
      defaultVisibility: workspaces.defaultVisibility,
      defaultSort: workspaces.defaultSort,
      allowPublicDocuments: workspaces.allowPublicDocuments,
      bio: workspaces.bio,
      brandColor: workspaces.brandColor,
      logoUrl: workspaces.logoUrl,
      showLogoInExports: workspaces.showLogoInExports,
      exportFontMain: workspaces.exportFontMain,
      exportFooterEnabled: workspaces.exportFooterEnabled,
      exportFooterCompanyName: workspaces.exportFooterCompanyName,
      exportFooterTagline: workspaces.exportFooterTagline,
      exportFooterLinkUrl: workspaces.exportFooterLinkUrl,
      exportFooterLinkLabel: workspaces.exportFooterLinkLabel,
      ownerUserId: workspaces.ownerUserId,
    })
    .from(workspaces)
    .where(eq(workspaces.id, membership.workspaceId))
    .limit(1);

  if (!workspace) return null;

  return {
    ...workspace,
    role: membership.role,
  };
}

export async function getWorkspaceDeletionPreview(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceDeletionPreview | null> {
  const database = getDbOrThrow();

  const [workspace] = await database
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      ownerUserId: workspaces.ownerUserId,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) return null;

  const [
    activeWorkspaceRows,
    documentCount,
    memberCount,
    pendingInviteCount,
    apiKeyCount,
  ] = await Promise.all([
    database
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.status, "active"),
        ),
      ),
    database
      .select({ value: count() })
      .from(posts)
      .where(eq(posts.workspaceId, workspaceId))
      .then((rows) => rows[0]?.value ?? 0),
    database
      .select({ value: count() })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.status, "active"),
        ),
      )
      .then((rows) => rows[0]?.value ?? 0),
    database
      .select({ value: count() })
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          gt(workspaceInvitations.expiresAt, new Date()),
        ),
      )
      .then((rows) => rows[0]?.value ?? 0),
    database
      .select({ value: count() })
      .from(apiKeys)
      .where(eq(apiKeys.workspaceId, workspaceId))
      .then((rows) => rows[0]?.value ?? 0),
  ]);

  const isOwner = workspace.ownerUserId === userId;
  const hasAnotherWorkspace = activeWorkspaceRows.some(
    (row) => row.workspaceId !== workspaceId,
  );
  const reason = !isOwner
    ? "not_owner"
    : !hasAnotherWorkspace
      ? "last_workspace"
      : undefined;

  return {
    workspaceId: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    documentCount,
    memberCount,
    pendingInviteCount,
    apiKeyCount,
    canDelete: !reason,
    reason,
  };
}

export async function deleteWorkspace(
  userId: string,
  workspaceId: string,
  confirmSlug: string,
): Promise<
  | { success: true; deletedWorkspaceId: string; nextWorkspaceId: string }
  | {
      error:
        | "not_found"
        | "forbidden"
        | "confirmation_mismatch"
        | "last_workspace";
    }
> {
  const database = getDbOrThrow();
  const normalizedConfirmation = confirmSlug.trim();

  const result = await deleteWorkspaceRows(database, userId, workspaceId, normalizedConfirmation);
  // Its members' seats and, past the included two, its Pro workspace slot.
  if ("success" in result) await releaseUnusedBilling(userId, { workspaces: true });
  return result;
}

async function deleteWorkspaceRows(
  database: ReturnType<typeof getDbOrThrow>,
  userId: string,
  workspaceId: string,
  normalizedConfirmation: string,
) {
  return database.transaction(async (tx) => {
    const [workspace] = await tx
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        ownerUserId: workspaces.ownerUserId,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) return { error: "not_found" as const };
    if (workspace.ownerUserId !== userId) {
      return { error: "forbidden" as const };
    }
    if (normalizedConfirmation !== workspace.slug) {
      return { error: "confirmation_mismatch" as const };
    }

    const activeWorkspaces = await tx
      .select({
        workspaceId: workspaceMembers.workspaceId,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.status, "active"),
        ),
      )
      .orderBy(workspaceMembers.joinedAt);

    const nextWorkspace = activeWorkspaces.find(
      (row) => row.workspaceId !== workspaceId,
    );

    if (!nextWorkspace) {
      return { error: "last_workspace" as const };
    }

    const workspacePosts = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.workspaceId, workspaceId));

    const workspacePostIds = workspacePosts.map((post) => post.id);
    const auditConditions = [eq(auditEvents.workspaceId, workspaceId)];
    if (workspacePostIds.length > 0) {
      auditConditions.push(inArray(auditEvents.postId, workspacePostIds));
    }

    await tx.delete(auditEvents).where(or(...auditConditions));

    await tx.insert(auditEvents).values({
      actorUserId: userId,
      eventType: "deleted",
      metadata: {
        reason: "workspace_delete",
        workspaceId,
        workspaceName: workspace.name,
        workspaceSlug: workspace.slug,
      },
    });

    await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));

    return {
      success: true as const,
      deletedWorkspaceId: workspaceId,
      nextWorkspaceId: nextWorkspace.workspaceId,
    };
  });
}

export async function updateWorkspaceName(
  userId: string,
  workspaceId: string,
  name: string,
) {
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

  if (!membership || membership.role === "member") {
    return null;
  }

  await database
    .update(workspaces)
    .set({ name, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  return { name };
}

export async function updateAllowPublicDocuments(
  userId: string,
  workspaceId: string,
  allowed: boolean,
) {
  const database = getDbOrThrow();

  const [workspace] = await database
    .select({ ownerUserId: workspaces.ownerUserId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace || workspace.ownerUserId !== userId) {
    return null;
  }

  await database
    .update(workspaces)
    .set({ allowPublicDocuments: allowed, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  return { allowPublicDocuments: allowed };
}

/**
 * Updates the workspace's default article sort. Owner-only — same
 * permission level as `updateAllowPublicDocuments` since this also
 * affects how every visitor experiences the workspace.
 *
 * `value` must already be a known `PostSort`; the API layer
 * validates with `parsePostSort` before calling here.
 */
export async function updateWorkspaceDefaultSort(
  userId: string,
  workspaceId: string,
  value: PostSort,
) {
  const database = getDbOrThrow();

  const [workspace] = await database
    .select({ ownerUserId: workspaces.ownerUserId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace || workspace.ownerUserId !== userId) {
    return null;
  }

  await database
    .update(workspaces)
    .set({ defaultSort: value, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  return { defaultSort: value };
}

export async function updateWorkspaceBio(
  userId: string,
  workspaceId: string,
  bio: string | null,
) {
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

  if (!membership || membership.role === "member") {
    return null;
  }

  const trimmed = bio?.trim() || null;

  await database
    .update(workspaces)
    .set({ bio: trimmed, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  return { bio: trimmed };
}

export async function updateBrandColor(
  userId: string,
  workspaceId: string,
  color: string,
) {
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

  if (!membership || membership.role === "member") {
    return null;
  }

  await database
    .update(workspaces)
    .set({ brandColor: color, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  return { brandColor: color };
}

export async function updateLogoUrl(
  userId: string,
  workspaceId: string,
  logoUrl: string | null,
) {
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

  if (!membership || membership.role === "member") {
    return null;
  }

  await database
    .update(workspaces)
    .set({ logoUrl, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  return { logoUrl };
}

export async function updateShowLogoInExports(
  userId: string,
  workspaceId: string,
  show: boolean,
) {
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

  if (!membership || membership.role === "member") {
    return null;
  }

  await database
    .update(workspaces)
    .set({ showLogoInExports: show, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  return { showLogoInExports: show };
}

/**
 * Rename a workspace's slug (the first segment of every post URL).
 *
 * Admin/owner only. All existing post URLs under `/{oldSlug}/…` stop
 * resolving immediately after this succeeds — we don't keep a redirect
 * table. The caller (UI) is responsible for showing a warning dialog
 * before invoking this.
 *
 * Returns:
 *   - `{ slug }` on success
 *   - `{ error: "forbidden" }` when the caller is a member (not admin)
 *   - `{ error: "invalid_slug" }` for bad format
 *   - `{ error: "reserved_slug" }` for reserved words
 *   - `{ error: "slug_taken" }` when another workspace owns it
 *   - `{ error: "unchanged" }` when the new slug equals the current one
 */
export async function updateWorkspaceSlug(
  userId: string,
  workspaceId: string,
  rawSlug: string,
): Promise<
  | { slug: string }
  | {
      error:
        | "forbidden"
        | "invalid_slug"
        | "reserved_slug"
        | "slug_taken"
        | "unchanged"
        | "not_found";
      message?: string;
    }
> {
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

  if (!membership || membership.role === "member") {
    return { error: "forbidden" };
  }

  const normalized = normalizeWorkspaceSlug(rawSlug);
  const parsed = workspaceSlugSchema.safeParse(normalized);
  if (!parsed.success) {
    return {
      error: "invalid_slug",
      message: parsed.error.issues[0]?.message ?? "Invalid workspace ID.",
    };
  }
  if (isReservedWorkspaceSlug(normalized)) {
    return { error: "reserved_slug" };
  }

  // Short-circuit if the slug hasn't actually changed — avoids a pointless
  // write and lets the UI treat this as a clean no-op rather than an error.
  const [current] = await database
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!current) return { error: "not_found" };
  if (current.slug === normalized) return { error: "unchanged" };

  // Collision check before UPDATE. The unique index will also catch it,
  // but catching it here gives us a clean typed error instead of a pg
  // constraint-violation turning into a 500.
  const [conflict] = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, normalized))
    .limit(1);
  if (conflict) return { error: "slug_taken" };

  await database
    .update(workspaces)
    .set({ slug: normalized, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  return { slug: normalized };
}

/**
 * Set the default font used for this workspace's PDF exports.
 *
 * `fontId` must be a key from EXPORT_FONTS in validation.ts. Passing
 * `null` clears the override so the converter falls back to its built-in
 * default ("Arial").
 *
 * Admin/owner only. Returns `null` on forbidden, `{ error: "invalid_font" }`
 * for a bad id, or `{ font }` on success.
 */
export async function updateExportFont(
  userId: string,
  workspaceId: string,
  fontId: string | null,
): Promise<{ font: string | null } | { error: "forbidden" | "invalid_font" } | null> {
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

  if (!membership || membership.role === "member") {
    return { error: "forbidden" };
  }

  if (fontId !== null) {
    const parsed = exportFontSchema.safeParse(fontId);
    if (!parsed.success) return { error: "invalid_font" };
  }

  await database
    .update(workspaces)
    .set({ exportFontMain: fontId, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  return { font: fontId };
}

/**
 * Update the PDF export footer configuration (line 1 = company name,
 * line 2 = tagline + URL). Empty strings / nulls mean "use the
 * converter's built-in default".
 *
 * Admin/owner only.
 */
export async function updateExportFooter(
  userId: string,
  workspaceId: string,
  input: ExportFooterInput,
): Promise<
  | {
      exportFooterEnabled: boolean;
      exportFooterCompanyName: string | null;
      exportFooterTagline: string | null;
      exportFooterLinkUrl: string | null;
      exportFooterLinkLabel: string | null;
    }
  | { error: "forbidden" | "invalid_input" }
> {
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

  if (!membership || membership.role === "member") {
    return { error: "forbidden" };
  }

  const parsed = exportFooterSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  // Normalize empty strings to nulls so we don't store "" in the DB and
  // then have to special-case it when merging into the converter payload.
  const nullish = (v: string | null | undefined) =>
    v === undefined || v === null || v === "" ? null : v;

  const patch = {
    exportFooterEnabled: parsed.data.enabled,
    exportFooterCompanyName: nullish(parsed.data.companyName),
    exportFooterTagline: nullish(parsed.data.tagline),
    exportFooterLinkUrl: nullish(parsed.data.linkUrl),
    exportFooterLinkLabel: nullish(parsed.data.linkLabel),
    updatedAt: new Date(),
  };

  await database
    .update(workspaces)
    .set(patch)
    .where(eq(workspaces.id, workspaceId));

  return {
    exportFooterEnabled: patch.exportFooterEnabled,
    exportFooterCompanyName: patch.exportFooterCompanyName,
    exportFooterTagline: patch.exportFooterTagline,
    exportFooterLinkUrl: patch.exportFooterLinkUrl,
    exportFooterLinkLabel: patch.exportFooterLinkLabel,
  };
}

// ---------------------------------------------------------------------------
// Team management
// ---------------------------------------------------------------------------

/**
 * Resolve caller's active workspace membership (helper).
 * When `workspaceId` is provided the lookup is scoped to that workspace;
 * otherwise it falls back to the first active membership (legacy behaviour).
 */
async function getCallerMembership(userId: string, workspaceId?: string) {
  const database = getDbOrThrow();
  const conditions = [
    eq(workspaceMembers.userId, userId),
    eq(workspaceMembers.status, "active"),
  ];
  if (workspaceId) {
    conditions.push(eq(workspaceMembers.workspaceId, workspaceId));
  }
  const [membership] = await database
    .select({
      id: workspaceMembers.id,
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .where(and(...conditions))
    .limit(1);
  return membership ?? null;
}

export async function getTeamMembers(userId: string, workspaceId?: string) {
  const database = getDbOrThrow();
  const membership = await getCallerMembership(userId, workspaceId);
  if (!membership) return null;

  const rows = await database
    .select({
      id: workspaceMembers.id,
      userId: workspaceMembers.userId,
      name: user.name,
      email: user.email,
      image: user.image,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .innerJoin(user, eq(workspaceMembers.userId, user.id))
    .where(
      and(
        eq(workspaceMembers.workspaceId, membership.workspaceId),
        eq(workspaceMembers.status, "active"),
      ),
    )
    .orderBy(workspaceMembers.joinedAt);

  return rows.map((r) => ({
    ...r,
    joinedAt: r.joinedAt.toISOString(),
  }));
}

export async function getTeamStats(userId: string, workspaceId?: string) {
  const database = getDbOrThrow();
  const membership = await getCallerMembership(userId, workspaceId);
  if (!membership) return null;

  const wid = membership.workspaceId;

  const [[memberCount], [adminCount], [inviteCount]] = await Promise.all([
    database
      .select({ value: count() })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, wid),
          eq(workspaceMembers.status, "active"),
        ),
      ),
    database
      .select({ value: count() })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, wid),
          eq(workspaceMembers.status, "active"),
          inArray(workspaceMembers.role, ["owner", "admin"]),
        ),
      ),
    database
      .select({ value: count() })
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, wid),
          gt(workspaceInvitations.expiresAt, new Date()),
        ),
      ),
  ]);

  return {
    totalMembers: memberCount?.value ?? 0,
    pendingInvites: inviteCount?.value ?? 0,
    admins: adminCount?.value ?? 0,
  };
}

export async function getPendingInvitations(userId: string, workspaceId?: string) {
  const database = getDbOrThrow();
  const membership = await getCallerMembership(userId, workspaceId);
  if (!membership || membership.role === "member") return null;

  const rows = await database
    .select({
      id: workspaceInvitations.id,
      email: workspaceInvitations.email,
      role: workspaceInvitations.role,
      createdAt: workspaceInvitations.createdAt,
      invitedByName: user.name,
    })
    .from(workspaceInvitations)
    .innerJoin(user, eq(workspaceInvitations.invitedByUserId, user.id))
    .where(
      and(
        eq(workspaceInvitations.workspaceId, membership.workspaceId),
        gt(workspaceInvitations.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(workspaceInvitations.createdAt));

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    invitedAt: r.createdAt.toISOString(),
    invitedByName: r.invitedByName,
  }));
}

export async function inviteTeamMember(
  userId: string,
  email: string,
  role: "admin" | "member",
  workspaceId?: string,
) {
  const database = getDbOrThrow();
  const normalizedEmail = email.trim().toLowerCase();
  const membership = await getCallerMembership(userId, workspaceId);
  if (!membership || membership.role === "member") {
    return { error: "forbidden" as const };
  }

  // Check if email is already a member
  const existingMembers = await database
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .innerJoin(user, eq(workspaceMembers.userId, user.id))
    .where(
      and(
        eq(workspaceMembers.workspaceId, membership.workspaceId),
        sql`lower(${user.email}) = ${normalizedEmail}`,
        eq(workspaceMembers.status, "active"),
      ),
    )
    .limit(1);

  if (existingMembers.length > 0) {
    return { error: "already_member" as const };
  }

  // Check for an existing invitation. There is a DB-level unique
  // constraint on (workspace_id, email), so an expired row should be
  // refreshed instead of inserting a duplicate.
  const [existingInvite] = await database
    .select({
      id: workspaceInvitations.id,
      expiresAt: workspaceInvitations.expiresAt,
    })
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.workspaceId, membership.workspaceId),
        eq(workspaceInvitations.email, normalizedEmail),
      ),
    )
    .limit(1);

  if (existingInvite && existingInvite.expiresAt > new Date()) {
    return { error: "already_invited" as const };
  }

  // Enforce max 50 pending invitations AND the per-plan member cap.
  // Creator-comped owners are an internal full-access tier, so they can
  // run larger seed/customer workspaces without hitting the anti-spam
  // pending invite guard.
  // We count active members + unexpired invites against the plan cap so
  // a Free user can't race 5 simultaneous invites past the limit.
  const [inviteCount, memberCount, tier, ownerCompedTier] = await Promise.all([
    database
      .select({ value: count() })
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, membership.workspaceId),
          gt(workspaceInvitations.expiresAt, new Date()),
        ),
      )
      .then((rows) => rows[0]),
    database
      .select({ value: count() })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, membership.workspaceId),
          eq(workspaceMembers.status, "active"),
        ),
      )
      .then((rows) => rows[0]),
    getEffectiveWorkspaceTier(membership.workspaceId),
    getWorkspaceOwnerCompedTier(membership.workspaceId),
  ]);

  if (ownerCompedTier !== "creator" && (inviteCount?.value ?? 0) >= 50) {
    return { error: "invite_limit" as const };
  }

  // Team is uncapped at the app layer (Paddle seats handle it). For
  // Free/Pro, count both active members and outstanding invites — both
  // contribute toward the cap.
  if (tier && tier !== "team") {
    const limit = PLAN_LIMITS[tier].membersPerWorkspace;
    const used = (memberCount?.value ?? 0) + (inviteCount?.value ?? 0);
    if (used >= limit) {
      return { error: "member_limit" as const, plan: tier, limit };
    }
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [invitation] = existingInvite
    ? await database
        .update(workspaceInvitations)
        .set({
          role,
          token,
          invitedByUserId: userId,
          expiresAt,
          createdAt: new Date(),
        })
        .where(eq(workspaceInvitations.id, existingInvite.id))
        .returning({
          id: workspaceInvitations.id,
          email: workspaceInvitations.email,
          role: workspaceInvitations.role,
          createdAt: workspaceInvitations.createdAt,
        })
    : await database
        .insert(workspaceInvitations)
        .values({
          workspaceId: membership.workspaceId,
          email: normalizedEmail,
          role,
          token,
          invitedByUserId: userId,
          expiresAt,
        })
        .returning({
          id: workspaceInvitations.id,
          email: workspaceInvitations.email,
          role: workspaceInvitations.role,
          createdAt: workspaceInvitations.createdAt,
        });

  // Get workspace name and inviter name for the email
  const [[workspace], [inviter]] = await Promise.all([
    database
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, membership.workspaceId))
      .limit(1),
    database
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
  ]);

  const baseUrl = process.env.BETTER_AUTH_URL || siteConfig.url;
  const inviteUrl = `${baseUrl}/invite/${token}`;

  await sendEmail({
    to: normalizedEmail,
    subject: `You've been invited to ${workspace?.name ?? "a workspace"} on OpenDocs`,
    html: teamInvitationEmail({
      inviteUrl,
      workspaceName: workspace?.name ?? "a workspace",
      invitedByName: inviter?.name ?? "A team member",
    }),
  });

  return {
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      invitedAt: invitation.createdAt.toISOString(),
      invitedByName: inviter?.name ?? "You",
    },
  };
}

export async function getInvitationLandingState(token: string) {
  const database = getDbOrThrow();

  const [invitation] = await database
    .select({
      email: workspaceInvitations.email,
      expiresAt: workspaceInvitations.expiresAt,
      workspaceName: workspaces.name,
      invitedByName: user.name,
    })
    .from(workspaceInvitations)
    .innerJoin(workspaces, eq(workspaceInvitations.workspaceId, workspaces.id))
    .innerJoin(user, eq(workspaceInvitations.invitedByUserId, user.id))
    .where(eq(workspaceInvitations.token, token))
    .limit(1);

  if (!invitation) {
    return { status: "not_found" as const };
  }

  if (invitation.expiresAt < new Date()) {
    return { status: "expired" as const };
  }

  const invitedEmail = invitation.email.trim().toLowerCase();
  const [existingUser] = await database
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${invitedEmail}`)
    .limit(1);

  return {
    status: "valid" as const,
    email: invitedEmail,
    workspaceName: invitation.workspaceName,
    invitedByName: invitation.invitedByName,
    existingUser: Boolean(existingUser),
  };
}

export async function resendInvitation(userId: string, invitationId: string) {
  const database = getDbOrThrow();

  // Look up the invitation first to know which workspace it belongs to
  const [invitation] = await database
    .select({
      id: workspaceInvitations.id,
      email: workspaceInvitations.email,
      token: workspaceInvitations.token,
      workspaceId: workspaceInvitations.workspaceId,
    })
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.id, invitationId))
    .limit(1);

  if (!invitation) {
    return { error: "not_found" as const };
  }

  // Check caller's membership in the invitation's workspace
  const membership = await getCallerMembership(userId, invitation.workspaceId);
  if (!membership || membership.role === "member") {
    return { error: "forbidden" as const };
  }

  // Reset expiry
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await database
    .update(workspaceInvitations)
    .set({ expiresAt: newExpiresAt })
    .where(eq(workspaceInvitations.id, invitationId));

  // Re-send email
  const [[workspace], [inviter]] = await Promise.all([
    database
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, membership.workspaceId))
      .limit(1),
    database
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
  ]);

  const baseUrl = process.env.BETTER_AUTH_URL || siteConfig.url;
  const inviteUrl = `${baseUrl}/invite/${invitation.token}`;

  await sendEmail({
    to: invitation.email,
    subject: `Reminder: You've been invited to ${workspace?.name ?? "a workspace"} on OpenDocs`,
    html: teamInvitationEmail({
      inviteUrl,
      workspaceName: workspace?.name ?? "a workspace",
      invitedByName: inviter?.name ?? "A team member",
    }),
  });

  return { success: true as const };
}

export async function cancelInvitation(userId: string, invitationId: string) {
  const database = getDbOrThrow();

  // Look up invitation to determine its workspace
  const [invitation] = await database
    .select({
      id: workspaceInvitations.id,
      workspaceId: workspaceInvitations.workspaceId,
    })
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.id, invitationId))
    .limit(1);

  if (!invitation) return { error: "not_found" as const };

  // Check caller's membership in that workspace
  const membership = await getCallerMembership(userId, invitation.workspaceId);
  if (!membership || membership.role === "member") {
    return { error: "forbidden" as const };
  }

  const [deleted] = await database
    .delete(workspaceInvitations)
    .where(eq(workspaceInvitations.id, invitationId))
    .returning({ id: workspaceInvitations.id });

  if (!deleted) return { error: "not_found" as const };
  return { success: true as const };
}

export async function changeMemberRole(
  userId: string,
  targetMembershipId: string,
  newRole: "admin" | "member",
) {
  const database = getDbOrThrow();

  // Look up target first to determine the workspace
  const [target] = await database
    .select({
      id: workspaceMembers.id,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      workspaceId: workspaceMembers.workspaceId,
    })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.id, targetMembershipId))
    .limit(1);

  if (!target) {
    return { error: "not_found" as const };
  }

  // Check caller's membership in the same workspace
  const caller = await getCallerMembership(userId, target.workspaceId);
  if (!caller || caller.role === "member") {
    return { error: "forbidden" as const };
  }

  // Cannot change owner's role
  if (target.role === "owner") {
    return { error: "forbidden" as const };
  }

  // Only owner can demote an admin
  if (target.role === "admin" && newRole === "member" && caller.role !== "owner") {
    return { error: "forbidden" as const };
  }

  await database
    .update(workspaceMembers)
    .set({ role: newRole })
    .where(eq(workspaceMembers.id, targetMembershipId));

  // Return updated member info
  const [updated] = await database
    .select({
      id: workspaceMembers.id,
      userId: workspaceMembers.userId,
      name: user.name,
      email: user.email,
      image: user.image,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .innerJoin(user, eq(workspaceMembers.userId, user.id))
    .where(eq(workspaceMembers.id, targetMembershipId))
    .limit(1);

  return {
    member: {
      ...updated,
      joinedAt: updated.joinedAt.toISOString(),
    },
  };
}

export async function removeTeamMember(
  userId: string,
  targetMembershipId: string,
) {
  const database = getDbOrThrow();

  // Look up target first to determine the workspace
  const [target] = await database
    .select({
      id: workspaceMembers.id,
      role: workspaceMembers.role,
      workspaceId: workspaceMembers.workspaceId,
    })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.id, targetMembershipId))
    .limit(1);

  if (!target) {
    return { error: "not_found" as const };
  }

  // Check caller's membership in the same workspace
  const caller = await getCallerMembership(userId, target.workspaceId);
  if (!caller || caller.role === "member") {
    return { error: "forbidden" as const };
  }

  // Cannot remove owner
  if (target.role === "owner") {
    return { error: "forbidden" as const };
  }

  // Only owner can remove an admin
  if (target.role === "admin" && caller.role !== "owner") {
    return { error: "forbidden" as const };
  }

  await database
    .delete(workspaceMembers)
    .where(eq(workspaceMembers.id, targetMembershipId));

  const ownerId = await getWorkspaceOwnerId(target.workspaceId);
  if (ownerId) await releaseUnusedBilling(ownerId);

  return { success: true as const };
}

// ---------------------------------------------------------------------------
// Multi-workspace helpers
// ---------------------------------------------------------------------------

/** Return all workspaces the user is an active member of. */
export async function getUserWorkspaces(userId: string) {
  const database = getDbOrThrow();
  return database
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      name: workspaces.name,
      slug: workspaces.slug,
      logoUrl: workspaces.logoUrl,
      allowPublicDocuments: workspaces.allowPublicDocuments,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active"),
      ),
    )
    .orderBy(workspaceMembers.joinedAt);
}

// ---- Plan limits ----
// Per-plan numeric caps now live in `../billing/plan-limits.ts` so the
// client (sidebar gating, billing UI) and the server (this file) share a
// single source of truth. Team is uncapped on workspaces and members —
// owning or being a member of a Team workspace implies you're paying for
// org-scale collaboration via per-seat billing on Paddle.

export async function getUserPlan(userId: string): Promise<"free" | "pro"> {
  const database = getDbOrThrow();
  const [record] = await database
    .select({ plan: user.plan })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return (record?.plan as "free" | "pro") ?? "free";
}

/**
 * The user's own billing entitlement, from what they pay for or were
 * given, in this priority order:
 *   1. `user.compedTier === "creator"` → treated as Team. Full access
 *      the operator gives without billing (their own accounts, testing).
 *   2. A live Team subscription the user pays for → "team".
 *   3. `user.compedTier === "friends"` → treated as Pro. Founder access
 *      gives early users paid personal features without granting Team's
 *      unlimited workspace/member entitlements.
 *   4. A live Pro subscription, or the personal plan on `user.plan`.
 *
 * Being a member of someone else's Team workspace doesn't count: it gives
 * Team features inside that workspace (its `workspaces.plan`, or its
 * owner's tier; see getEffectiveWorkspaceTier), not in workspaces the
 * member owns.
 *
 * Use this anywhere the answer to "what's this user's overall tier?"
 * matters — sidebar nudges, workspace-creation limits, etc. — as opposed
 * to billing/state.ts's effectivePlan which is scoped to the *active*
 * workspace. For what a workspace may do, use getEffectiveWorkspaceTier.
 */
export async function getUserEffectiveBillingTier(
  userId: string,
): Promise<"free" | "pro" | "team"> {
  const database = getDbOrThrow();

  const [userRow, teamSubscription, proSubscription] = await Promise.all([
    database
      .select({ plan: user.plan, compedTier: user.compedTier })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.plan, "team"),
          inCurrentBillingEnvironment(),
          inArray(subscriptions.status, [...LIVE_SUBSCRIPTION_STATUSES]),
        ),
      ),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.plan, "pro"),
          inCurrentBillingEnvironment(),
          inArray(subscriptions.status, [...LIVE_SUBSCRIPTION_STATUSES]),
        ),
      ),
  ]);

  const compedPlan = compedTierToPlanTier(userRow[0]?.compedTier);
  if (compedPlan === "team") return "team";
  if ((teamSubscription[0]?.count ?? 0) > 0) return "team";
  if (compedPlan === "pro") return "pro";
  if ((proSubscription[0]?.count ?? 0) > 0) return "pro";
  if (userRow[0]?.plan === "pro") return "pro";
  return "free";
}

export async function getUserCompedTier(
  userId: string,
): Promise<CompedTier | null> {
  const database = getDbOrThrow();
  const [record] = await database
    .select({ compedTier: user.compedTier })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return normalizeCompedTier(record?.compedTier) ?? null;
}

async function getWorkspaceOwnerCompedTier(
  workspaceId: string,
): Promise<CompedTier | null> {
  const database = getDbOrThrow();
  const [record] = await database
    .select({ compedTier: user.compedTier })
    .from(workspaces)
    .innerJoin(user, eq(user.id, workspaces.ownerUserId))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return normalizeCompedTier(record?.compedTier);
}

export async function getActiveProExtraWorkspaces(userId: string): Promise<number> {
  const database = getDbOrThrow();
  const rows = await database
    .select({ extraWorkspaces: subscriptions.extraWorkspaces })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.plan, "pro"),
        inCurrentBillingEnvironment(),
        inArray(subscriptions.status, [...LIVE_SUBSCRIPTION_STATUSES]),
      ),
    );

  return rows.reduce((sum, row) => sum + Math.max(0, row.extraWorkspaces ?? 0), 0);
}

export async function getUserWorkspaceLimit(
  userId: string,
): Promise<{ tier: "free" | "pro" | "team"; limit: number; extraWorkspaces: number }> {
  const tier = await getUserEffectiveBillingTier(userId);
  if (tier !== "pro") {
    return { tier, limit: PLAN_LIMITS[tier].workspaces, extraWorkspaces: 0 };
  }

  const extraWorkspaces = await getActiveProExtraWorkspaces(userId);
  return {
    tier,
    limit: PLAN_LIMITS.pro.workspaces + extraWorkspaces,
    extraWorkspaces,
  };
}

export async function getOwnedWorkspaceCount(userId: string): Promise<number> {
  const database = getDbOrThrow();
  const [result] = await database
    .select({ count: count() })
    .from(workspaces)
    .where(eq(workspaces.ownerUserId, userId));
  return result?.count ?? 0;
}

export async function getOwnedWorkspaceUniqueMemberCount(userId: string): Promise<number> {
  const database = getDbOrThrow();
  const [result] = await database
    .select({ count: sql<number>`count(distinct ${workspaceMembers.userId})::int` })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaces.ownerUserId, userId),
        eq(workspaceMembers.status, "active"),
      ),
    );
  return result?.count ?? 0;
}

/**
 * The plan a workspace is on, which decides everything it may do: the
 * document limit, Word export, the export footer, member limits,
 * integrations. A workspace on Team (a legacy workspace-scoped Team
 * subscription) is Team; otherwise it's whatever its owner pays for or
 * was given (getUserEffectiveBillingTier): a Pro or Team subscription, or
 * Friends/Creator access. Members bring nothing of their own, and being
 * a member elsewhere never upgrades a workspace you own.
 */
export async function getEffectiveWorkspaceTier(
  workspaceId: string,
): Promise<PlanTier | null> {
  const database = getDbOrThrow();

  const [ws] = await database
    .select({
      plan: workspaces.plan,
      ownerUserId: workspaces.ownerUserId,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!ws) return null;
  if (ws.plan === "team") return "team";

  // Delegate to the user-level helper so Friends comps inherit Pro-tier
  // limits for workspaces they own, without duplicating the logic here.
  return getUserEffectiveBillingTier(ws.ownerUserId);
}

export async function createWorkspace(
  userId: string,
  name: string,
  slug: string,
): Promise<
  | { error: "invalid_slug"; message: string }
  | { error: "reserved_slug" }
  | { error: "slug_taken" }
  | { error: "plan_limit"; plan: string; limit: number }
  | { workspace: { id: string; slug: string; name: string } }
> {
  const database = getDbOrThrow();

  // Validate slug
  const normalized = normalizeWorkspaceSlug(slug);
  const parsed = workspaceSlugSchema.safeParse(normalized);
  if (!parsed.success) {
    return { error: "invalid_slug", message: parsed.error.issues[0]?.message ?? "Invalid workspace ID." };
  }
  if (isReservedWorkspaceSlug(normalized)) {
    return { error: "reserved_slug" };
  }

  // Check plan limits — use effective tier (includes Team membership)
  // so a Team-org user isn't capped at Pro's workspace count.
  const [entitlement, owned] = await Promise.all([
    getUserWorkspaceLimit(userId),
    getOwnedWorkspaceCount(userId),
  ]);
  const { tier, limit } = entitlement;
  if (owned >= limit) {
    return { error: "plan_limit", plan: tier, limit };
  }

  // Check slug uniqueness
  const [existing] = await database
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.slug, normalized))
    .limit(1);
  if (existing) {
    return { error: "slug_taken" };
  }

  // Create workspace + membership in a transaction
  const [workspace] = await database.transaction(async (tx) => {
    const [ws] = await tx
      .insert(workspaces)
      .values({
        name: name.trim(),
        slug: normalized,
        ownerUserId: userId,
        ...FREE_PLAN_EXPORT_DEFAULTS,
      })
      .returning({
        id: workspaces.id,
        slug: workspaces.slug,
        name: workspaces.name,
      });

    await tx.insert(workspaceMembers).values({
      workspaceId: ws.id,
      userId,
      role: "owner",
      status: "active",
    });

    await tx.insert(projects).values({
      workspaceId: ws.id,
      name: "Default",
      slug: "default",
      isDefault: true,
    });

    return [ws];
  });

  return { workspace };
}

export async function acceptInvitation(userId: string, token: string) {
  const database = getDbOrThrow();

  const [[invitation], [currentUser]] = await Promise.all([
    database
      .select({
        id: workspaceInvitations.id,
        workspaceId: workspaceInvitations.workspaceId,
        email: workspaceInvitations.email,
        role: workspaceInvitations.role,
        expiresAt: workspaceInvitations.expiresAt,
      })
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.token, token))
      .limit(1),
    database
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
  ]);

  if (!invitation) {
    return { error: "not_found" as const };
  }

  if (invitation.expiresAt < new Date()) {
    return { error: "expired" as const };
  }

  const invitedEmail = invitation.email.trim().toLowerCase();
  const callerEmail = currentUser?.email.trim().toLowerCase();
  if (!callerEmail || callerEmail !== invitedEmail) {
    return { error: "forbidden" as const };
  }

  // Check if already a member
  const [existing] = await database
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, invitation.workspaceId),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active"),
      ),
    )
    .limit(1);

  if (existing) {
    // Clean up the invitation and return success — they're already in
    await database
      .delete(workspaceInvitations)
      .where(eq(workspaceInvitations.id, invitation.id));
    return { workspaceId: invitation.workspaceId, role: "member" as const };
  }

  const admitted = await admitMember({
    workspaceId: invitation.workspaceId,
    userId,
    role: invitation.role,
    invitationId: invitation.id,
  });
  if ("error" in admitted) return admitted;

  return { workspaceId: invitation.workspaceId, role: invitation.role };
}

/**
 * Adds `userId` to a workspace after the same checks every join path needs:
 * the plan's member cap (Free/Pro) and a Team seat (Paddle quantity). When
 * `invitationId` is given, the invitation is consumed in the same
 * transaction. Shared by token invites, API invite acceptance and domain
 * auto-join.
 */
async function admitMember(input: {
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  invitationId?: string;
}): Promise<{ ok: true } | { error: "not_found" } | { error: "member_limit"; plan: PlanTier; limit: number } | { error: "billing_failed" }> {
  const database = getDbOrThrow();
  const [workspaceOwner] = await database
    .select({ ownerUserId: workspaces.ownerUserId })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);

  if (!workspaceOwner) {
    return { error: "not_found" as const };
  }

  const tier = await getEffectiveWorkspaceTier(input.workspaceId);
  if (tier && tier !== "team") {
    const limit = PLAN_LIMITS[tier].membersPerWorkspace;
    const [memberCount] = await database
      .select({ value: count() })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, input.workspaceId),
          eq(workspaceMembers.status, "active"),
        ),
      );

    if ((memberCount?.value ?? 0) >= limit) {
      return { error: "member_limit" as const, plan: tier, limit };
    }
  }

  const ownerCompedTier = await getUserCompedTier(workspaceOwner.ownerUserId);
  const seatCapacity =
    ownerCompedTier === "creator"
      ? { ok: true as const }
      : await ensureTeamSeatCapacity(workspaceOwner.ownerUserId, input.userId);

  if (!seatCapacity.ok) {
    return { error: "billing_failed" as const };
  }

  await database.transaction(async (tx) => {
    // A previous membership row (disabled/invited) would trip the unique
    // index, so reactivate it instead of inserting a duplicate.
    const [previous] = await tx
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, input.workspaceId),
          eq(workspaceMembers.userId, input.userId),
        ),
      )
      .limit(1);
    if (previous) {
      await tx
        .update(workspaceMembers)
        .set({ role: input.role, status: "active", joinedAt: new Date() })
        .where(eq(workspaceMembers.id, previous.id));
    } else {
      await tx.insert(workspaceMembers).values({
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: input.role,
        status: "active",
      });
    }
    if (input.invitationId) {
      await tx
        .delete(workspaceInvitations)
        .where(eq(workspaceInvitations.id, input.invitationId));
    }
  });

  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Team management for agents and the CLI: invitee-side invitations, leaving,
// and email-domain auto-join. Anything that grants membership without a
// token from the invite email requires a verified email address, so an
// unverified account registered with someone else's address can't use it.
// ---------------------------------------------------------------------------

// Shared mailbox providers: a rule for these would let half the internet in.
const CONSUMER_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me",
  "protonmail.com", "pm.me", "gmx.com", "gmx.net", "mail.com", "yandex.com", "yandex.ru",
  "zoho.com", "qq.com", "163.com", "126.com", "hey.com", "fastmail.com", "tutanota.com",
]);

export function normalizeEmailDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^@/, "");
}

async function getVerifiedEmail(userId: string) {
  const database = getDbOrThrow();
  const [row] = await database
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) return null;
  const email = row.email.trim().toLowerCase();
  return { email, domain: email.split("@")[1] ?? "", verified: row.emailVerified };
}

/**
 * The caller's own pending invitations (matched by verified email) plus
 * workspaces they may join through an email-domain rule.
 */
export async function listMyInvitations(userId: string) {
  const database = getDbOrThrow();
  const me = await getVerifiedEmail(userId);
  if (!me) return { emailVerified: false, invitations: [], joinable: [] };

  const memberOf = await getViewerWorkspaceIds(userId);
  const invitations = me.verified
    ? await database
        .select({
          id: workspaceInvitations.id,
          workspaceId: workspaceInvitations.workspaceId,
          workspaceName: workspaces.name,
          workspaceSlug: workspaces.slug,
          role: workspaceInvitations.role,
          invitedByName: user.name,
          expiresAt: workspaceInvitations.expiresAt,
        })
        .from(workspaceInvitations)
        .innerJoin(workspaces, eq(workspaceInvitations.workspaceId, workspaces.id))
        .innerJoin(user, eq(workspaceInvitations.invitedByUserId, user.id))
        .where(
          and(
            eq(workspaceInvitations.email, me.email),
            gt(workspaceInvitations.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(workspaceInvitations.createdAt))
    : [];

  const joinable =
    me.verified && me.domain
      ? (
          await database
            .select({
              workspaceId: workspaces.id,
              workspaceName: workspaces.name,
              workspaceSlug: workspaces.slug,
              domain: workspaceDomains.domain,
            })
            .from(workspaceDomains)
            .innerJoin(workspaces, eq(workspaceDomains.workspaceId, workspaces.id))
            .where(and(eq(workspaceDomains.domain, me.domain), eq(workspaceDomains.isVerified, true)))
        ).filter((row) => !memberOf.includes(row.workspaceId))
      : [];

  return {
    emailVerified: me.verified,
    invitations: invitations
      .filter((row) => !memberOf.includes(row.workspaceId))
      .map((row) => ({ ...row, expiresAt: row.expiresAt.toISOString() })),
    joinable,
  };
}

async function loadInvitationForInvitee(userId: string, invitationId: string) {
  const database = getDbOrThrow();
  const [invitation] = await database
    .select({
      id: workspaceInvitations.id,
      workspaceId: workspaceInvitations.workspaceId,
      email: workspaceInvitations.email,
      role: workspaceInvitations.role,
      expiresAt: workspaceInvitations.expiresAt,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
    })
    .from(workspaceInvitations)
    .innerJoin(workspaces, eq(workspaceInvitations.workspaceId, workspaces.id))
    .where(eq(workspaceInvitations.id, invitationId))
    .limit(1);
  if (!invitation) return { error: "not_found" as const };
  if (invitation.expiresAt < new Date()) return { error: "expired" as const };
  const me = await getVerifiedEmail(userId);
  if (!me || me.email !== invitation.email.trim().toLowerCase()) {
    return { error: "not_found" as const };
  }
  if (!me.verified) return { error: "email_not_verified" as const };
  return { invitation };
}

/** Accept an invitation by id (no email token) — verified email required. */
export async function acceptInvitationById(userId: string, invitationId: string) {
  const loaded = await loadInvitationForInvitee(userId, invitationId);
  if ("error" in loaded) return loaded;
  const { invitation } = loaded;
  const workspace = { id: invitation.workspaceId, name: invitation.workspaceName, slug: invitation.workspaceSlug };

  const memberOf = await getViewerWorkspaceIds(userId);
  if (memberOf.includes(invitation.workspaceId)) {
    await getDbOrThrow().delete(workspaceInvitations).where(eq(workspaceInvitations.id, invitation.id));
    return { workspace, role: invitation.role, alreadyMember: true as const };
  }

  const admitted = await admitMember({
    workspaceId: invitation.workspaceId,
    userId,
    role: invitation.role,
    invitationId: invitation.id,
  });
  if ("error" in admitted) return admitted;
  return { workspace, role: invitation.role, alreadyMember: false as const };
}

export async function declineInvitation(userId: string, invitationId: string) {
  const loaded = await loadInvitationForInvitee(userId, invitationId);
  if ("error" in loaded) return loaded;
  await getDbOrThrow()
    .delete(workspaceInvitations)
    .where(eq(workspaceInvitations.id, loaded.invitation.id));
  return { success: true as const, workspaceSlug: loaded.invitation.workspaceSlug };
}

/** Leave a workspace. Owners can't leave (transfer or delete it instead). */
export async function leaveWorkspace(userId: string, workspaceId: string) {
  const database = getDbOrThrow();
  const membership = await getCallerMembership(userId, workspaceId);
  if (!membership) return { error: "not_found" as const };
  if (membership.role === "owner") return { error: "owner_cannot_leave" as const };
  await database.delete(workspaceMembers).where(eq(workspaceMembers.id, membership.id));
  const ownerId = await getWorkspaceOwnerId(workspaceId);
  if (ownerId) await releaseUnusedBilling(ownerId);
  const remaining = await getUserWorkspaces(userId);
  return {
    success: true as const,
    remainingWorkspaces: remaining.map((w) => ({ id: w.workspaceId, slug: w.slug, name: w.name })),
  };
}

export async function listAutoJoinDomains(userId: string, workspaceId: string) {
  const membership = await getCallerMembership(userId, workspaceId);
  if (!membership) return { error: "not_found" as const };
  const rows = await getDbOrThrow()
    .select({ domain: workspaceDomains.domain, createdAt: workspaceDomains.createdAt })
    .from(workspaceDomains)
    .where(and(eq(workspaceDomains.workspaceId, workspaceId), eq(workspaceDomains.isVerified, true)))
    .orderBy(workspaceDomains.createdAt);
  return { domains: rows.map((row) => ({ domain: row.domain, createdAt: row.createdAt.toISOString() })) };
}

/**
 * Let anyone who signs in with a verified @<domain> email join as a member.
 * Admins can only add their own email's domain (proving they belong to it),
 * and never a consumer mailbox domain.
 */
export async function addAutoJoinDomain(userId: string, workspaceId: string, rawDomain: string) {
  const membership = await getCallerMembership(userId, workspaceId);
  if (!membership) return { error: "not_found" as const };
  if (membership.role === "member") return { error: "forbidden" as const };
  const domain = normalizeEmailDomain(rawDomain);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return { error: "invalid_domain" as const };
  if (CONSUMER_EMAIL_DOMAINS.has(domain)) return { error: "consumer_domain" as const, domain };
  const me = await getVerifiedEmail(userId);
  if (!me?.verified) return { error: "email_not_verified" as const };
  if (me.domain !== domain) return { error: "domain_mismatch" as const, domain, yourDomain: me.domain };

  await getDbOrThrow()
    .insert(workspaceDomains)
    .values({ workspaceId, domain, isVerified: true })
    .onConflictDoUpdate({
      target: [workspaceDomains.workspaceId, workspaceDomains.domain],
      set: { isVerified: true },
    });
  return listAutoJoinDomains(userId, workspaceId);
}

export async function removeAutoJoinDomain(userId: string, workspaceId: string, rawDomain: string) {
  const membership = await getCallerMembership(userId, workspaceId);
  if (!membership) return { error: "not_found" as const };
  if (membership.role === "member") return { error: "forbidden" as const };
  await getDbOrThrow()
    .delete(workspaceDomains)
    .where(and(eq(workspaceDomains.workspaceId, workspaceId), eq(workspaceDomains.domain, normalizeEmailDomain(rawDomain))));
  return listAutoJoinDomains(userId, workspaceId);
}

/** Join a workspace through an email-domain rule matching the caller's verified email. */
export async function joinWorkspaceByDomain(userId: string, workspaceIdOrSlug: string) {
  const database = getDbOrThrow();
  const me = await getVerifiedEmail(userId);
  if (!me) return { error: "not_found" as const };
  if (!me.verified) return { error: "email_not_verified" as const };

  const [rule] = await database
    .select({ workspaceId: workspaces.id, name: workspaces.name, slug: workspaces.slug })
    .from(workspaceDomains)
    .innerJoin(workspaces, eq(workspaceDomains.workspaceId, workspaces.id))
    .where(
      and(
        or(eq(workspaces.id, workspaceIdOrSlug), eq(workspaces.slug, workspaceIdOrSlug.toLowerCase())),
        eq(workspaceDomains.domain, me.domain),
        eq(workspaceDomains.isVerified, true),
      ),
    )
    .limit(1);
  if (!rule) return { error: "not_found" as const };

  const workspace = { id: rule.workspaceId, name: rule.name, slug: rule.slug };
  if ((await getViewerWorkspaceIds(userId)).includes(rule.workspaceId)) {
    return { workspace, role: "member" as const, alreadyMember: true as const };
  }
  const admitted = await admitMember({ workspaceId: rule.workspaceId, userId, role: "member" });
  if ("error" in admitted) return admitted;
  return { workspace, role: "member" as const, alreadyMember: false as const };
}
