import type { ApiClient } from "../api-client";
import { config } from "../config";
import type { ClientIdentity } from "./client";
import { parseDocRef } from "./doc-ref";
import { UserFacingError } from "./errors";

/**
 * Everything a tool needs for one call: the API client (acting as the
 * user), the granted scopes, who's calling, and cached lookups for the
 * user's workspaces, the connection's defaults and projects. Workspaces,
 * projects and documents can be named the way people talk about them (name,
 * slug, link) and are resolved here.
 */

export type Workspace = { id: string; name: string; slug: string; role: string };
export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  isDefault: boolean;
  postCount?: number;
  updatedAt?: string;
  recentTitles?: string[];
  lastPublishedAt?: string | null;
};
export type ConnectionInfo = {
  clientId: string;
  clientName: string | null;
  workspace: { id: string; name: string; slug: string } | null;
  project: { id: string; name: string; slug: string } | null;
  organize: "ask" | "auto" | "off";
  scopes: string[];
};
export type MeInfo = {
  userId: string;
  onboarding: {
    username: string | null;
    workspace: { id: string; name: string; slug: string; defaultProject?: { id: string; slug: string } | null } | null;
  };
  quota: { documents: { plan: string; limit: number | null; used: number; remaining: number | null } | null };
};
export type DocTarget = { ref: string; workspaceId?: string; projectId?: string };

function norm(value: string): string {
  return value.trim().toLowerCase();
}

export class ToolContext {
  private workspacesPromise?: Promise<Workspace[]>;
  private connectionPromise?: Promise<ConnectionInfo>;
  private mePromise?: Promise<MeInfo>;
  private projectsByWorkspace = new Map<string, Promise<Project[]>>();

  constructor(
    readonly api: ApiClient,
    readonly scopes: Set<string>,
    readonly client: ClientIdentity,
  ) {}

  get webUrl(): string {
    return config.webUrl;
  }

  workspaces(): Promise<Workspace[]> {
    this.workspacesPromise ??= this.api
      .get<{ workspaces: Workspace[] }>("/workspaces")
      .then((r) => r.workspaces);
    return this.workspacesPromise;
  }

  connection(): Promise<ConnectionInfo> {
    this.connectionPromise ??= this.api.get<ConnectionInfo>("/mcp/connection");
    return this.connectionPromise;
  }

  me(workspaceId?: string): Promise<MeInfo> {
    if (workspaceId) return this.api.get<MeInfo>("/me", { workspaceId });
    this.mePromise ??= this.api.get<MeInfo>("/me");
    return this.mePromise;
  }

  forgetConnection() {
    this.connectionPromise = undefined;
  }

  /** A workspace by id, slug or name; without one, this connection's default. */
  async resolveWorkspace(ref?: string | null): Promise<Workspace> {
    const workspaces = await this.workspaces();
    if (workspaces.length === 0) {
      throw new UserFacingError(
        `This account has no workspace yet. Ask the user to create one at ${config.webUrl}/dashboard.`,
        "no_workspace",
      );
    }
    if (ref && ref.trim()) {
      const wanted = norm(ref);
      const found =
        workspaces.find((w) => w.id === ref.trim()) ??
        workspaces.find((w) => norm(w.slug) === wanted) ??
        workspaces.find((w) => norm(w.name) === wanted);
      if (!found) {
        throw new UserFacingError(
          `No workspace called "${ref}". The user's workspaces: ${workspaces
            .map((w) => `${w.name} (${w.slug})`)
            .join(", ")}.`,
          "not_a_member",
        );
      }
      return found;
    }
    const connection = await this.connection().catch(() => null);
    const preferred = connection?.workspace?.id;
    if (preferred) {
      const found = workspaces.find((w) => w.id === preferred);
      if (found) return found;
    }
    const me = await this.me().catch(() => null);
    const onboarding = me?.onboarding.workspace?.id;
    return workspaces.find((w) => w.id === onboarding) ?? workspaces[0]!;
  }

  projects(workspaceId: string): Promise<Project[]> {
    let cached = this.projectsByWorkspace.get(workspaceId);
    if (!cached) {
      cached = this.api
        .get<{ projects: Project[] }>("/projects", { workspaceId })
        .then((r) => r.projects);
      this.projectsByWorkspace.set(workspaceId, cached);
    }
    return cached;
  }

  async findProject(workspaceId: string, ref: string): Promise<Project | null> {
    const projects = await this.projects(workspaceId);
    const wanted = norm(ref);
    return (
      projects.find((p) => p.id === ref.trim()) ??
      projects.find((p) => norm(p.slug) === wanted) ??
      projects.find((p) => norm(p.name) === wanted) ??
      null
    );
  }

  /**
   * A project by id, slug or name. With `create`, an unknown name creates
   * it (the CLI's `--project` behaves the same way).
   */
  async resolveProject(
    workspaceId: string,
    ref: string,
    options: { create?: boolean } = {},
  ): Promise<{ project: Project; created: boolean }> {
    const found = await this.findProject(workspaceId, ref);
    if (found) return { project: found, created: false };
    if (!options.create) {
      const projects = await this.projects(workspaceId);
      throw new UserFacingError(
        `No project called "${ref}" in this workspace. Projects: ${projects.map((p) => p.name).join(", ") || "none"}.`,
        "project_not_found",
      );
    }
    const { project } = await this.api.post<{ project: Project }>("/projects", {
      workspaceId,
      name: ref.trim(),
    });
    this.projectsByWorkspace.delete(workspaceId);
    return { project, created: true };
  }

  /** The default project for new documents in a workspace, if one is set for this connection. */
  async defaultProjectFor(workspaceId: string): Promise<Project | null> {
    const connection = await this.connection().catch(() => null);
    if (!connection?.project || connection.workspace?.id !== workspaceId) return null;
    return this.findProject(workspaceId, connection.project.id);
  }

  /** A document named by link, slug or ID, ready for /posts/:ref?workspaceId&projectId. */
  async resolveDocument(input: string): Promise<DocTarget> {
    const webHost = new URL(config.webUrl).hostname.toLowerCase();
    const parsed = parseDocRef(input, [webHost, "opendocs.cc", "www.opendocs.cc"]);
    const target: DocTarget = { ref: parsed.ref };
    if (parsed.workspaceSlug) {
      const workspaces = await this.workspaces();
      const workspace = workspaces.find((w) => norm(w.slug) === norm(parsed.workspaceSlug!));
      if (workspace) {
        target.workspaceId = workspace.id;
        if (parsed.projectSlug) {
          const project = await this.findProject(workspace.id, parsed.projectSlug);
          if (project) target.projectId = project.id;
        }
      }
    }
    return target;
  }

  docQuery(target: DocTarget) {
    return { workspaceId: target.workspaceId, projectId: target.projectId };
  }

  can(scope: string): boolean {
    return this.scopes.has(scope);
  }
}
