import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import {
  mcpConnections,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  projects,
  workspaceIntegrations,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { EXTENSION_CLIENT_METADATA_PATH } from "../extension/config";
import { instanceWebUrl } from "../config/instance";

/**
 * MCP connections: one per (user, OAuth client). The consent screen
 * creates or refreshes it with the user's default workspace; the MCP tools
 * read and change its defaults (`set_defaults`); Dashboard → Connected
 * apps lists and revokes it.
 *
 * Access tokens are stateless JWTs that live an hour, so revoking can't
 * delete them. Instead `tokens_valid_after` is moved to now and the API
 * rejects tokens issued earlier (see `checkConnectionToken`).
 */

export type OrganizeMode = "ask" | "auto" | "off";

export type McpConnection = typeof mcpConnections.$inferSelect;

// Apps we name and badge when their Client ID Metadata Document is hosted on
// exactly this host. Any other https client_id is shown by its host.
const KNOWN_CIMD_HOSTS: Record<string, string> = {
  "claude.ai": "Claude",
  "claude.com": "Claude",
  "www.claude.com": "Claude",
  "chatgpt.com": "ChatGPT",
  "vscode.dev": "VS Code",
  "cursor.com": "Cursor",
  "www.cursor.com": "Cursor",
};

// Our own clients, which publish their metadata on opendocs.cc. The note
// replaces the consent screen's line about AI apps asking before they act.
const FIRST_PARTY_CIMD_CLIENTS: Record<string, { name: string; note: string }> = {
  [EXTENSION_CLIENT_METADATA_PATH]: {
    name: "OpenDocs extension",
    note: "It publishes only the answers and chats you choose, when you click Publish.",
  },
};

function firstParty(clientId: string): { name: string; note: string } | null {
  try {
    const url = new URL(clientId);
    // The web app's own client documents (opendocs.cc, or this instance).
    const own = new URL(instanceWebUrl()).hostname;
    if (url.hostname !== own && url.hostname !== `www.${own}` && url.hostname !== "opendocs.cc") return null;
    return FIRST_PARTY_CIMD_CLIENTS[url.pathname] ?? null;
  } catch {
    return null;
  }
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * How the consent screen and Connected apps name a client. A client that
 * registered with a Client ID Metadata Document has an https client_id
 * whose host proves who it is: known hosts get their product name, others
 * are named by the host (never by the name they gave themselves). A
 * dynamically registered client only has a self-declared name; pass the
 * redirect_uri of the request so the screen shows where the browser will
 * really go.
 */
export function describeOAuthClient(
  client: {
    clientId: string;
    name: string | null;
    uri?: string | null;
    icon?: string | null;
    redirectUris?: string[] | null;
  },
  redirectUri?: string | null,
): { name: string; host: string | null; verified: boolean; icon: string | null; note?: string } {
  const cimdHost = /^https:\/\//i.test(client.clientId) ? hostOf(client.clientId) : null;
  if (cimdHost) {
    const ours = firstParty(client.clientId);
    if (ours) return { name: ours.name, host: cimdHost, verified: true, icon: client.icon ?? null, note: ours.note };
    return {
      name: KNOWN_CIMD_HOSTS[cimdHost] ?? cimdHost,
      host: cimdHost,
      verified: true,
      icon: KNOWN_CIMD_HOSTS[cimdHost] ? (client.icon ?? null) : null,
    };
  }
  return {
    name: client.name?.trim() || "An unnamed app",
    host: hostOf(redirectUri) ?? hostOf(client.redirectUris?.[0]),
    verified: false,
    icon: client.icon ?? null,
  };
}

export async function getOAuthClientRecord(clientId: string) {
  const database = getDbOrThrow();
  const [row] = await database
    .select({
      clientId: oauthClient.clientId,
      name: oauthClient.name,
      uri: oauthClient.uri,
      icon: oauthClient.icon,
      redirectUris: oauthClient.redirectUris,
      disabled: oauthClient.disabled,
    })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  return row ?? null;
}

export async function getConnection(userId: string, clientId: string) {
  const database = getDbOrThrow();
  const [row] = await database
    .select()
    .from(mcpConnections)
    .where(and(eq(mcpConnections.userId, userId), eq(mcpConnections.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

async function isActiveMember(userId: string, workspaceId: string) {
  const database = getDbOrThrow();
  const [row] = await database
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
  return Boolean(row);
}

/**
 * Called when the user approves the consent screen. Creates the connection
 * or reactivates a revoked one with the chosen default workspace. Tokens
 * issued before an earlier revoke stay invalid (`tokens_valid_after` is
 * kept).
 */
export async function upsertConnectionOnConsent(input: {
  userId: string;
  clientId: string;
  clientName: string;
  workspaceId: string;
}): Promise<McpConnection | { error: "forbidden" }> {
  if (!(await isActiveMember(input.userId, input.workspaceId))) return { error: "forbidden" };
  const database = getDbOrThrow();
  const existing = await getConnection(input.userId, input.clientId);
  // Keep a chosen project only while the workspace stays the same.
  const projectId = existing && existing.workspaceId === input.workspaceId ? existing.projectId : null;
  const now = new Date();
  const [row] = await database
    .insert(mcpConnections)
    .values({
      userId: input.userId,
      clientId: input.clientId,
      clientName: input.clientName.slice(0, 200),
      workspaceId: input.workspaceId,
    })
    .onConflictDoUpdate({
      target: [mcpConnections.userId, mcpConnections.clientId],
      set: {
        clientName: input.clientName.slice(0, 200),
        workspaceId: input.workspaceId,
        projectId,
        revokedAt: null,
        updatedAt: now,
      },
    })
    .returning();
  forgetConnectionCache(input.userId, input.clientId);
  return row!;
}

export type ConnectionTokenCheck =
  | { ok: true; connection: McpConnection }
  | { ok: false; reason: "revoked" | "no_connection" };

const tokenCheckCache = new Map<string, { at: number; connection: McpConnection | null }>();
const TOKEN_CHECK_TTL_MS = 10_000;
const TOKEN_CHECK_CACHE_MAX = 10_000;
const LAST_USED_THROTTLE_MS = 5 * 60_000;

/**
 * Decides whether an access token for (user, client) issued at `issuedAt`
 * is still allowed: the connection must exist (it's created on the consent
 * screen), not be disconnected, and the token must be newer than the last
 * disconnect. Cached for 10 seconds per connection, so a disconnect takes
 * effect within that window. Also bumps `last_used_at` (at most every five
 * minutes).
 */
export async function checkConnectionToken(
  userId: string,
  clientId: string,
  issuedAt: Date,
): Promise<ConnectionTokenCheck> {
  const key = `${userId}:${clientId}`;
  const now = Date.now();
  const cached = tokenCheckCache.get(key);
  let connection: McpConnection | null;
  if (cached && now - cached.at < TOKEN_CHECK_TTL_MS) {
    connection = cached.connection;
  } else {
    connection = await getConnection(userId, clientId);
    if (tokenCheckCache.size >= TOKEN_CHECK_CACHE_MAX) tokenCheckCache.clear();
    tokenCheckCache.set(key, { at: now, connection });
  }
  if (!connection) return { ok: false, reason: "no_connection" };
  if (connection.revokedAt) return { ok: false, reason: "revoked" };
  // JWT iat has second precision: a token from the same second as the
  // disconnect counts as before it.
  const validAfter = connection.tokensValidAfter;
  if (validAfter && Math.floor(issuedAt.getTime() / 1000) <= Math.floor(validAfter.getTime() / 1000)) {
    return { ok: false, reason: "revoked" };
  }
  if (!connection.lastUsedAt || now - connection.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    const usedAt = new Date(now);
    connection.lastUsedAt = usedAt;
    void getDbOrThrow()
      .update(mcpConnections)
      .set({ lastUsedAt: usedAt })
      .where(eq(mcpConnections.id, connection.id))
      .catch(() => undefined);
  }
  return { ok: true, connection };
}

export function forgetConnectionCache(userId: string, clientId: string) {
  tokenCheckCache.delete(`${userId}:${clientId}`);
}

export type ConnectionSettingsInput = {
  workspaceId?: string;
  projectId?: string | null;
  organize?: OrganizeMode;
};

/**
 * Default workspace, project and organise mode for a connection (the
 * `set_defaults` tool). The project must belong to the workspace; switching
 * workspace clears a project from the old one.
 */
export async function updateConnectionSettings(
  userId: string,
  clientId: string,
  clientName: string | null,
  input: ConnectionSettingsInput,
): Promise<McpConnection | { error: "forbidden" | "project_not_found" }> {
  const database = getDbOrThrow();
  let connection = await getConnection(userId, clientId);
  if (!connection) {
    await database
      .insert(mcpConnections)
      .values({ userId, clientId, clientName: clientName?.slice(0, 200) ?? null })
      .onConflictDoNothing();
    connection = (await getConnection(userId, clientId))!;
  }

  const workspaceId = input.workspaceId ?? connection.workspaceId;
  if (input.workspaceId && !(await isActiveMember(userId, input.workspaceId))) {
    return { error: "forbidden" };
  }
  let projectId =
    input.projectId !== undefined
      ? input.projectId
      : input.workspaceId && input.workspaceId !== connection.workspaceId
        ? null
        : connection.projectId;
  if (projectId) {
    const [project] = await database
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId ?? "")))
      .limit(1);
    if (!project) return { error: "project_not_found" };
    projectId = project.id;
  }

  const [row] = await database
    .update(mcpConnections)
    .set({
      workspaceId: workspaceId ?? null,
      projectId: projectId ?? null,
      ...(input.organize ? { organize: input.organize } : {}),
      updatedAt: new Date(),
    })
    .where(eq(mcpConnections.id, connection.id))
    .returning();
  forgetConnectionCache(userId, clientId);
  return row!;
}

/** Connected apps for the dashboard, newest activity first. */
export async function listConnections(userId: string) {
  const database = getDbOrThrow();
  const rows = await database
    .select({
      id: mcpConnections.id,
      clientId: mcpConnections.clientId,
      clientName: mcpConnections.clientName,
      workspaceId: mcpConnections.workspaceId,
      workspaceName: workspaces.name,
      lastUsedAt: mcpConnections.lastUsedAt,
      createdAt: mcpConnections.createdAt,
      updatedAt: mcpConnections.updatedAt,
      name: oauthClient.name,
      uri: oauthClient.uri,
      icon: oauthClient.icon,
      redirectUris: oauthClient.redirectUris,
    })
    .from(mcpConnections)
    .leftJoin(oauthClient, eq(oauthClient.clientId, mcpConnections.clientId))
    .leftJoin(workspaces, eq(workspaces.id, mcpConnections.workspaceId))
    .where(and(eq(mcpConnections.userId, userId), isNull(mcpConnections.revokedAt)))
    .orderBy(desc(mcpConnections.updatedAt));
  if (rows.length === 0) return [];

  const consents = await database
    .select({ clientId: oauthConsent.clientId, scopes: oauthConsent.scopes })
    .from(oauthConsent)
    .where(
      and(
        eq(oauthConsent.userId, userId),
        inArray(
          oauthConsent.clientId,
          rows.map((row) => row.clientId),
        ),
      ),
    );
  const scopesByClient = new Map<string, string[]>();
  for (const consent of consents) {
    const merged = new Set([...(scopesByClient.get(consent.clientId) ?? []), ...consent.scopes]);
    scopesByClient.set(consent.clientId, [...merged]);
  }

  return rows.map((row) => {
    const described = describeOAuthClient({
      clientId: row.clientId,
      name: row.name ?? row.clientName,
      uri: row.uri,
      icon: row.icon,
      redirectUris: row.redirectUris,
    });
    return {
      id: row.id,
      clientId: row.clientId,
      name: described.name,
      host: described.host,
      verified: described.verified,
      icon: described.icon,
      workspaceName: row.workspaceName ?? null,
      scopes: (scopesByClient.get(row.clientId) ?? []).filter((scope) => scope !== "offline_access"),
      connectedAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    };
  });
}

/**
 * Disconnects an app: forgets the consent (the next connect asks again),
 * revokes its refresh tokens and invalidates access tokens already issued.
 */
export async function revokeConnection(userId: string, connectionId: string): Promise<boolean> {
  const database = getDbOrThrow();
  const [connection] = await database
    .select()
    .from(mcpConnections)
    .where(and(eq(mcpConnections.id, connectionId), eq(mcpConnections.userId, userId)))
    .limit(1);
  if (!connection) return false;
  const now = new Date();
  await database.transaction(async (tx) => {
    await tx
      .update(mcpConnections)
      .set({ revokedAt: now, tokensValidAfter: now, updatedAt: now })
      .where(eq(mcpConnections.id, connection.id));
    await tx
      .delete(oauthConsent)
      .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, connection.clientId)));
    await tx
      .update(oauthRefreshToken)
      .set({ revoked: now })
      .where(
        and(
          eq(oauthRefreshToken.userId, userId),
          eq(oauthRefreshToken.clientId, connection.clientId),
          isNull(oauthRefreshToken.revoked),
        ),
      );
  });
  forgetConnectionCache(userId, connection.clientId);
  return true;
}

/** Workspace IDs among `workspaceIds` with Google Drive or DocuSeal connected. */
export async function workspacesWithIntegrations(workspaceIds: string[]): Promise<Set<string>> {
  if (workspaceIds.length === 0) return new Set();
  const database = getDbOrThrow();
  const rows = await database
    .select({ workspaceId: workspaceIntegrations.workspaceId })
    .from(workspaceIntegrations)
    .where(inArray(workspaceIntegrations.workspaceId, workspaceIds));
  return new Set(rows.map((row) => row.workspaceId));
}
