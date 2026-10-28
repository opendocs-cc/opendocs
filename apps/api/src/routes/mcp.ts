import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDbOrThrow } from "@opendocs/shared/db/guards";
import { projects, workspaces } from "@opendocs/shared/db/schema";
import { getConnection, updateConnectionSettings } from "@opendocs/shared/mcp/connections";

import { requireAuth } from "../auth/middleware";
import { validateBody } from "../middleware/validate";
import type { AuthenticatedRequest } from "../types";

/**
 * Defaults for an MCP connection (Claude, ChatGPT, …): the workspace and
 * project new documents go to, and how eagerly the assistant creates
 * projects. The CLI keeps these in its local config; MCP clients have no
 * local state, so they live on the server per connection.
 */

const router = Router();

function oauthOnly(req: AuthenticatedRequest) {
  return req.authMethod === "oauth" && req.oauth ? req.oauth : null;
}

async function describe(userId: string, clientId: string) {
  const connection = await getConnection(userId, clientId);
  const database = getDbOrThrow();
  const [workspace] = connection?.workspaceId
    ? await database
        .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
        .from(workspaces)
        .where(eq(workspaces.id, connection.workspaceId))
        .limit(1)
    : [];
  const [project] = connection?.projectId
    ? await database
        .select({ id: projects.id, name: projects.name, slug: projects.slug })
        .from(projects)
        .where(eq(projects.id, connection.projectId))
        .limit(1)
    : [];
  return {
    clientId,
    clientName: connection?.clientName ?? null,
    workspace: workspace ?? null,
    project: project ?? null,
    organize: connection?.organize ?? "ask",
  };
}

router.get("/mcp/connection", requireAuth, async (req, res, next) => {
  try {
    const authed = req as AuthenticatedRequest;
    const grant = oauthOnly(authed);
    if (!grant) {
      res.status(400).json({ error: "oauth_only", message: "Only MCP connections have connection settings." });
      return;
    }
    res.json({ ...(await describe(authed.userId, grant.clientId)), scopes: [...grant.scopes] });
  } catch (err) {
    next(err);
  }
});

const settingsBody = z
  .object({
    workspaceId: z.string().min(1).optional(),
    projectId: z.string().min(1).nullable().optional(),
    organize: z.enum(["ask", "auto", "off"]).optional(),
  })
  .strict();

router.put("/mcp/connection", requireAuth, validateBody(settingsBody), async (req, res, next) => {
  try {
    const authed = req as AuthenticatedRequest;
    const grant = oauthOnly(authed);
    if (!grant) {
      res.status(400).json({ error: "oauth_only", message: "Only MCP connections have connection settings." });
      return;
    }
    const result = await updateConnectionSettings(
      authed.userId,
      grant.clientId,
      grant.connection?.clientName ?? null,
      req.body as z.infer<typeof settingsBody>,
    );
    if ("error" in result) {
      res.status(result.error === "forbidden" ? 403 : 404).json({
        error: result.error === "forbidden" ? "not_a_member" : "project_not_found",
        message:
          result.error === "forbidden"
            ? "You're not a member of that workspace. Call get_account to see your workspaces."
            : "That project isn't in the workspace. Call list_projects to see the projects.",
      });
      return;
    }
    res.json({ ...(await describe(authed.userId, grant.clientId)), scopes: [...grant.scopes] });
  } catch (err) {
    next(err);
  }
});

export default router;
