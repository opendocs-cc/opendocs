import { and, count, eq, sql } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import { posts, projects, workspaceMembers } from "../db/schema";
import {
  isReservedProjectSlug,
  normalizeProjectSlug,
  projectSlugSchema,
} from "./validation";

export type ProjectRecord = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  isDefault: boolean;
};

function projectSelect() {
  return {
    id: projects.id,
    workspaceId: projects.workspaceId,
    name: projects.name,
    slug: projects.slug,
    isDefault: projects.isDefault,
  };
}

async function getMembership(
  userId: string,
  workspaceId: string,
): Promise<{ role: "owner" | "admin" | "member" } | null> {
  const database = getDbOrThrow();
  const [membership] = await database
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.status, "active"),
      ),
    )
    .limit(1);
  return membership ?? null;
}

function canManageProject(role: "owner" | "admin" | "member") {
  return role === "owner" || role === "admin";
}

function canCreateProject(role: "owner" | "admin" | "member") {
  return role === "owner" || role === "admin" || role === "member";
}

export async function ensureDefaultProjectForWorkspace(
  workspaceId: string,
): Promise<ProjectRecord> {
  const database = getDbOrThrow();
  const [existing] = await database
    .select(projectSelect())
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.isDefault, true)))
    .limit(1);
  if (existing) return existing;

  const [created] = await database
    .insert(projects)
    .values({
      workspaceId,
      name: "Default",
      slug: "default",
      isDefault: true,
    })
    .onConflictDoNothing()
    .returning(projectSelect());

  if (created) return created;

  const [raceWinner] = await database
    .select(projectSelect())
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.isDefault, true)))
    .limit(1);
  if (!raceWinner) throw new Error("Default project could not be created.");
  return raceWinner;
}

export async function getDefaultProjectForUser(
  userId: string,
  workspaceId: string,
): Promise<ProjectRecord | null> {
  const membership = await getMembership(userId, workspaceId);
  if (!membership) return null;
  return ensureDefaultProjectForWorkspace(workspaceId);
}

export async function resolveProjectForUser(args: {
  userId: string;
  workspaceId: string;
  projectId?: string | null;
  projectSlug?: string | null;
}): Promise<ProjectRecord | null> {
  const membership = await getMembership(args.userId, args.workspaceId);
  if (!membership) return null;

  if (!args.projectId && !args.projectSlug) {
    return ensureDefaultProjectForWorkspace(args.workspaceId);
  }

  const database = getDbOrThrow();
  const clauses = [eq(projects.workspaceId, args.workspaceId)];
  if (args.projectId) clauses.push(eq(projects.id, args.projectId));
  if (args.projectSlug) {
    clauses.push(eq(projects.slug, normalizeProjectSlug(args.projectSlug)));
  }

  const [project] = await database
    .select(projectSelect())
    .from(projects)
    .where(and(...clauses))
    .limit(1);
  return project ?? null;
}

export async function listProjectsForUser(userId: string, workspaceId: string) {
  const membership = await getMembership(userId, workspaceId);
  if (!membership) return null;
  await ensureDefaultProjectForWorkspace(workspaceId);

  const database = getDbOrThrow();
  const rows = await database
    .select({
      id: projects.id,
      workspaceId: projects.workspaceId,
      name: projects.name,
      slug: projects.slug,
      isDefault: projects.isDefault,
      postCount: sql<number>`count(${posts.id})::int`,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .leftJoin(posts, eq(posts.projectId, projects.id))
    .where(eq(projects.workspaceId, workspaceId))
    .groupBy(projects.id)
    .orderBy(sql`${projects.isDefault} desc`, projects.name);

  // The three most recently updated titles per project, so an agent can
  // tell what each project is about when deciding where a new document
  // belongs. Only titles the caller could read are included.
  const recent = await database
    .select({
      projectId: sql<string>`ranked.project_id`,
      title: sql<string>`ranked.title`,
      updatedAt: sql<Date>`ranked.updated_at`,
    })
    .from(
      sql`(
        select ${posts.projectId} as project_id, ${posts.title} as title, ${posts.updatedAt} as updated_at,
          row_number() over (partition by ${posts.projectId} order by ${posts.updatedAt} desc) as rn
        from ${posts}
        where ${posts.workspaceId} = ${workspaceId}
          and ${posts.isPublished} = true
          and (${posts.visibility} in ('workspace', 'public') or ${posts.authorUserId} = ${userId})
      ) as ranked`,
    )
    .where(sql`ranked.rn <= 3`);

  return rows.map((row) => {
    const mine = recent.filter((r) => r.projectId === row.id);
    return {
      ...row,
      recentTitles: mine.map((r) => r.title),
      lastPublishedAt: mine[0]?.updatedAt ? new Date(mine[0].updatedAt).toISOString() : null,
    };
  });
}

async function resolveUniqueProjectSlug(workspaceId: string, baseSlug: string) {
  const database = getDbOrThrow();
  let candidate = baseSlug || "project";
  if (isReservedProjectSlug(candidate)) candidate = `${candidate}-2`;

  let counter = 2;
  while (true) {
    const [existing] = await database
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.workspaceId, workspaceId), eq(projects.slug, candidate)))
      .limit(1);
    if (!existing) return candidate;
    counter += 1;
    candidate = `${baseSlug}-${counter}`;
  }
}

export async function createProjectForUser(
  userId: string,
  input: { workspaceId: string; name: string; slug?: string | null },
):
  Promise<
    | { error: "forbidden" }
    | { error: "invalid_slug"; message: string }
    | { error: "reserved_slug" }
    | { error: "slug_taken" }
    | { project: ProjectRecord }
  > {
  const membership = await getMembership(userId, input.workspaceId);
  if (!membership || !canCreateProject(membership.role)) {
    return { error: "forbidden" };
  }

  const rawSlug = input.slug?.trim() || input.name;
  const normalized = normalizeProjectSlug(rawSlug);
  const parsed = projectSlugSchema.safeParse(normalized);
  if (!parsed.success) {
    return {
      error: "invalid_slug",
      message: parsed.error.issues[0]?.message ?? "Invalid project slug.",
    };
  }
  if (input.slug && isReservedProjectSlug(normalized)) {
    return { error: "reserved_slug" };
  }

  const slug = input.slug
    ? normalized
    : await resolveUniqueProjectSlug(input.workspaceId, normalized);

  const database = getDbOrThrow();
  const [project] = await database
    .insert(projects)
    .values({
      workspaceId: input.workspaceId,
      name: input.name.trim(),
      slug,
      isDefault: false,
    })
    // An explicit slug isn't suffixed, so it can already be taken (or be
    // taken by a concurrent create): say so instead of failing the insert.
    .onConflictDoNothing({ target: [projects.workspaceId, projects.slug] })
    .returning(projectSelect());

  if (!project) return { error: "slug_taken" };
  return { project };
}

export async function renameProjectForUser(
  userId: string,
  projectId: string,
  input: { name?: string; slug?: string | null },
):
  Promise<
    | { error: "forbidden" }
    | { error: "not_found" }
    | { error: "default_project" }
    | { error: "invalid_slug"; message: string }
    | { error: "reserved_slug" }
    | { error: "slug_taken" }
    | { project: ProjectRecord }
  > {
  const database = getDbOrThrow();
  const [project] = await database
    .select(projectSelect())
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { error: "not_found" };

  const membership = await getMembership(userId, project.workspaceId);
  if (!membership || !canManageProject(membership.role)) {
    return { error: "forbidden" };
  }
  if (project.isDefault) return { error: "default_project" };

  const patch: {
    name?: string;
    slug?: string;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (input.name) patch.name = input.name.trim();
  if (input.slug) {
    const normalized = normalizeProjectSlug(input.slug);
    const parsed = projectSlugSchema.safeParse(normalized);
    if (!parsed.success) {
      return {
        error: "invalid_slug",
        message: parsed.error.issues[0]?.message ?? "Invalid project slug.",
      };
    }
    if (isReservedProjectSlug(normalized)) return { error: "reserved_slug" };
    const [existing] = await database
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.workspaceId, project.workspaceId), eq(projects.slug, normalized)))
      .limit(1);
    if (existing && existing.id !== project.id) return { error: "slug_taken" };
    patch.slug = normalized;
  }

  const [updated] = await database
    .update(projects)
    .set(patch)
    .where(eq(projects.id, project.id))
    .returning(projectSelect());
  return { project: updated };
}

export async function deleteProjectForUser(userId: string, projectId: string):
  Promise<
    | { error: "forbidden" }
    | { error: "not_found" }
    | { error: "default_project" }
    | { error: "project_not_empty"; postCount: number }
    | { deleted: true; projectId: string }
  > {
  const database = getDbOrThrow();
  const [project] = await database
    .select(projectSelect())
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { error: "not_found" };

  const membership = await getMembership(userId, project.workspaceId);
  if (!membership || !canManageProject(membership.role)) {
    return { error: "forbidden" };
  }
  if (project.isDefault) return { error: "default_project" };

  const [row] = await database
    .select({ count: count() })
    .from(posts)
    .where(eq(posts.projectId, project.id));
  const postCount = row?.count ?? 0;
  if (postCount > 0) {
    return { error: "project_not_empty", postCount };
  }

  await database.delete(projects).where(eq(projects.id, project.id));
  return { deleted: true, projectId: project.id };
}

export function projectUrlPath(workspaceSlug: string, project: Pick<ProjectRecord, "slug" | "isDefault">) {
  return project.isDefault
    ? `/${workspaceSlug}`
    : `/${workspaceSlug}/projects/${project.slug}`;
}

export function postUrlPath(
  workspaceSlug: string,
  project: Pick<ProjectRecord, "slug" | "isDefault">,
  postSlug: string,
) {
  return project.isDefault
    ? `/${workspaceSlug}/${postSlug}`
    : `/${workspaceSlug}/projects/${project.slug}/${postSlug}`;
}
