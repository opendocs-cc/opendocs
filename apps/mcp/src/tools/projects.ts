import { z } from "zod";

import { ok } from "../lib/result";
import { UserFacingError } from "../lib/errors";
import type { Project } from "../lib/context";
import { defineTool, DESTRUCTIVE, DESTRUCTIVE_SHARED, READ_ONLY, WRITE } from "./types";

const workspaceArg = z
  .string()
  .optional()
  .describe("Workspace name, slug or ID. Defaults to this connection's default workspace.");

export const listProjects = defineTool({
  name: "list_projects",
  title: "List projects",
  description:
    "The projects in a workspace with how many documents each has and their recent titles. Projects group related documents, like folders or git branches: one per client, matter, product or topic. Call it before publishing to pick the right project.",
  scope: "docs:read",
  annotations: READ_ONLY,
  input: z.object({ workspace: workspaceArg }),
  async run(args, ctx) {
    const workspace = await ctx.resolveWorkspace(args.workspace);
    const projects = await ctx.projects(workspace.id);
    const defaultProject = await ctx.defaultProjectFor(workspace.id);
    const lines = [`Projects in ${workspace.name} (${workspace.slug}):`];
    for (const p of projects) {
      const recent = p.recentTitles?.length ? ` — recent: ${p.recentTitles.slice(0, 3).join("; ")}` : "";
      const marks = [p.isDefault ? "workspace default" : null, defaultProject?.id === p.id ? "this app's default" : null]
        .filter(Boolean)
        .join(", ");
      lines.push(`- ${p.name} (${p.slug}), ${p.postCount ?? 0} documents${marks ? ` [${marks}]` : ""}${recent}`);
    }
    return ok(lines.join("\n"), {
      workspace,
      projects: projects.map(({ id, name, slug, isDefault, postCount, recentTitles }) => ({
        id,
        name,
        slug,
        isDefault,
        connectionDefault: defaultProject?.id === id,
        postCount,
        recentTitles,
      })),
    });
  },
});

export const createProject = defineTool({
  name: "create_project",
  title: "Create a project",
  description:
    "Create a project in a workspace. Check list_projects first and reuse a matching project instead of creating a near-duplicate (\"Acme\" rather than a new \"Acme Corp\"). In organise mode \"ask\", get the user's OK first.",
  scope: "docs:write",
  annotations: WRITE,
  input: z.object({
    name: z.string().trim().min(1).max(100),
    slug: z.string().trim().min(1).max(64).optional(),
    workspace: workspaceArg,
  }),
  async run(args, ctx) {
    const workspace = await ctx.resolveWorkspace(args.workspace);
    const { project } = await ctx.api.post<{ project: Project }>("/projects", {
      workspaceId: workspace.id,
      name: args.name,
      ...(args.slug ? { slug: args.slug } : {}),
    });
    return ok(`Created the "${project.name}" project (${project.slug}) in ${workspace.name}.`, { project, workspace });
  },
});

export const renameProject = defineTool({
  name: "rename_project",
  title: "Rename a project",
  description:
    "Rename a project, and optionally change its slug. Changing the slug changes the links of every document in it, so only do that when the user asks.",
  scope: "docs:write",
  annotations: { ...DESTRUCTIVE_SHARED, idempotentHint: true },
  input: z.object({
    project: z.string().describe("Project name, slug or ID."),
    name: z.string().trim().min(1).max(100),
    slug: z.string().trim().min(1).max(64).optional(),
    workspace: workspaceArg,
  }),
  async run(args, ctx) {
    const workspace = await ctx.resolveWorkspace(args.workspace);
    const { project } = await ctx.resolveProject(workspace.id, args.project);
    const result = await ctx.api.patch<{ project: Project }>(`/projects/${project.id}`, {
      name: args.name,
      ...(args.slug ? { slug: args.slug } : {}),
    });
    return ok(`Renamed "${project.name}" to "${result.project.name}" (${result.project.slug}).`, {
      ...result,
      previousName: project.name,
      previousSlug: project.slug,
    });
  },
});

export const deleteProject = defineTool({
  name: "delete_project",
  title: "Delete an empty project",
  description:
    "Delete a project. Only empty projects can be deleted; move or delete its documents first. confirm: true records that the user confirmed the deletion.",
  scope: "docs:write",
  annotations: DESTRUCTIVE,
  input: z.object({
    project: z.string().describe("Project name, slug or ID."),
    confirm: z.boolean().describe("true when the user confirmed deleting this project."),
    workspace: workspaceArg,
  }),
  async run(args, ctx) {
    if (!args.confirm) {
      throw new UserFacingError("Ask the user to confirm deleting the project, then call again with confirm: true.", "confirmation_required");
    }
    const workspace = await ctx.resolveWorkspace(args.workspace);
    const { project } = await ctx.resolveProject(workspace.id, args.project);
    if (project.isDefault) {
      throw new UserFacingError("The workspace's Default project can't be deleted.", "forbidden");
    }
    await ctx.api.delete(`/projects/${project.id}`);
    return ok(`Deleted the "${project.name}" project.`, { deleted: true, projectId: project.id, name: project.name });
  },
});
