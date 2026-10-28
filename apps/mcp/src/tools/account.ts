import { z } from "zod";

import { ApiError } from "../api-client";
import { ok } from "../lib/result";
import type { Project } from "../lib/context";
import { defineTool, READ_ONLY, WRITE } from "./types";

type Invitations = {
  invitations: Array<{ id: string; workspaceName: string; workspaceSlug: string; role: string; invitedByName?: string | null }>;
  joinable: Array<{ workspaceName: string; workspaceSlug: string; domain: string }>;
};

type IntegrationsOverview = {
  tier?: string;
  canUse?: boolean;
  integrations: Array<{
    provider: string;
    name: string;
    status: string;
    destinations?: Array<{ name: string; folderName?: string | null }>;
  }>;
};

const PERMISSION_TEXT: Record<string, string> = {
  "docs:read": "read documents",
  "docs:write": "create, change, share and export documents",
  integrations: "save to Google Drive and send for e-signature",
  "workspace:admin": "manage team, workspaces and export theme",
};

export const getAccount = defineTool({
  name: "get_account",
  title: "Get account and defaults",
  description:
    "Who the user is in OpenDocs: their workspaces (with role), the plan and document quota of the default workspace, where new documents go by default (workspace, project, organise mode), pending invitations, connected integrations (Google Drive folder names, e-signature) and what this app is allowed to do. Call it once at the start of a conversation about documents, and whenever you need a workspace or Drive folder name.",
  scope: "docs:read",
  annotations: READ_ONLY,
  input: z.object({}),
  async run(_args, ctx) {
    const [me, workspaces, connection] = await Promise.all([
      ctx.me(),
      ctx.workspaces(),
      ctx.connection().catch(() => null),
    ]);
    const workspace = await ctx.resolveWorkspace();
    const [quotaInfo, invitations, integrations, defaultProject] = await Promise.all([
      ctx.me(workspace.id).catch(() => me),
      ctx.api.get<Invitations>("/me/invitations").catch(() => null),
      ctx.can("integrations")
        ? ctx.api
            .get<IntegrationsOverview>("/integrations", { workspaceId: workspace.id })
            .catch((err: unknown) => (err instanceof ApiError ? { unavailable: err.code } : null))
        : Promise.resolve(null),
      ctx.defaultProjectFor(workspace.id),
    ]);
    const quota = quotaInfo.quota?.documents ?? null;
    const organize = connection?.organize ?? "ask";

    const lines: string[] = [];
    lines.push(`Signed in to OpenDocs as ${me.onboarding.username ?? "this user"}.`);
    lines.push(
      `Default workspace: ${workspace.name} (${workspace.slug}), role ${workspace.role}` +
        (quota
          ? quota.limit === null
            ? `, ${quota.plan} plan (unlimited documents).`
            : `, ${quota.plan} plan, ${quota.used} of ${quota.limit} documents used.`
          : "."),
    );
    lines.push(
      defaultProject
        ? `New documents go to the "${defaultProject.name}" project unless you choose another.`
        : "New documents go to the workspace's Default project unless you choose another.",
    );
    lines.push(
      `Organise mode: ${organize} (${
        organize === "auto"
          ? "create projects for new topics yourself and say so"
          : organize === "off"
            ? "always use the default project"
            : "ask before creating a project for a new topic"
      }).`,
    );
    if (workspaces.length > 1) {
      lines.push("", "Workspaces:");
      for (const w of workspaces) lines.push(`- ${w.name} (${w.slug}), ${w.role}${w.id === workspace.id ? " ← default" : ""}`);
    }
    const pending = [...(invitations?.invitations ?? []), ...(invitations?.joinable ?? [])];
    if (pending.length > 0) {
      lines.push("", "Waiting for the user (ask before joining):");
      for (const inv of invitations?.invitations ?? []) {
        lines.push(`- Invitation to ${inv.workspaceName} (${inv.workspaceSlug}) as ${inv.role}${inv.invitedByName ? ` from ${inv.invitedByName}` : ""}`);
      }
      for (const j of invitations?.joinable ?? []) {
        lines.push(`- Can join ${j.workspaceName} (${j.workspaceSlug}) with their @${j.domain} email`);
      }
    }
    if (integrations && "unavailable" in integrations) {
      lines.push(
        "",
        integrations.unavailable === "plan_required"
          ? "Google Drive and e-signatures aren't included in this workspace's plan."
          : "Google Drive and e-signatures aren't available to this user in this workspace.",
      );
    } else if (integrations) {
      lines.push("", "Integrations in this workspace:");
      for (const integration of integrations.integrations) {
        const folders = integration.destinations?.map((d) => d.name) ?? [];
        lines.push(
          `- ${integration.name}: ${integration.status.replace("_", " ")}${
            folders.length ? ` (folders: ${folders.join(", ")})` : ""
          }`,
        );
      }
    }
    lines.push(
      "",
      `This app may ${[...ctx.scopes].map((s) => PERMISSION_TEXT[s]).filter(Boolean).join("; ")}.`,
    );

    return ok(lines.join("\n"), {
      username: me.onboarding.username,
      defaultWorkspace: workspace,
      defaultProject: defaultProject ? { id: defaultProject.id, name: defaultProject.name, slug: defaultProject.slug } : null,
      organize,
      quota,
      workspaces,
      invitations: invitations ?? null,
      integrations: integrations && "integrations" in integrations ? integrations.integrations : null,
      ...(integrations && "unavailable" in integrations ? { integrationsUnavailable: integrations.unavailable } : {}),
      permissions: [...ctx.scopes],
    });
  },
});

export const setDefaults = defineTool({
  name: "set_defaults",
  title: "Set default workspace and project",
  description:
    "Change where new documents go for this connection: the default workspace, the default project (or null to use the workspace's Default project) and the organise mode (ask: ask before creating projects for new topics; auto: create them and say so; off: always use the default project). Use it when the user says something like \"from now on put things in the Legal project\" or \"use the Acme workspace\". Workspaces and projects can be given by name, slug or ID.",
  scope: "docs:read",
  annotations: { ...WRITE, idempotentHint: true },
  input: z.object({
    workspace: z.string().optional().describe("Workspace name, slug or ID."),
    project: z.string().nullable().optional().describe("Project name, slug or ID; null to clear."),
    organize: z.enum(["ask", "auto", "off"]).optional(),
  }),
  async run(args, ctx) {
    const workspace = args.workspace ? await ctx.resolveWorkspace(args.workspace) : null;
    const workspaceId = workspace?.id ?? (await ctx.resolveWorkspace()).id;
    let project: Project | null | undefined;
    if (args.project === null) project = null;
    else if (args.project) project = (await ctx.resolveProject(workspaceId, args.project)).project;

    const result = await ctx.api.put<{
      workspace: { name: string; slug: string } | null;
      project: { name: string } | null;
      organize: string;
    }>("/mcp/connection", {
      ...(workspace ? { workspaceId: workspace.id } : {}),
      ...(project !== undefined ? { projectId: project?.id ?? null } : {}),
      ...(args.organize ? { organize: args.organize } : {}),
    });
    ctx.forgetConnection();
    return ok(
      `Saved. New documents go to ${result.project ? `the "${result.project.name}" project in ` : ""}${
        result.workspace ? `${result.workspace.name} (${result.workspace.slug})` : "the default workspace"
      }. Organise mode: ${result.organize}.`,
      result,
    );
  },
});
