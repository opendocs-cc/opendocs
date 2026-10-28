/**
 * Workspace integrations: who may manage and use them, the stored
 * connections, the named destinations agents save to, and the run ledger.
 * Provider specifics live in ./google-drive and ./docuseal; the signing
 * lifecycle in ./signatures; saving files in ./storage.
 *
 * Like the other services, functions return `{ error }` objects for
 * expected failures; the API maps them to HTTP responses.
 */
import { and, asc, eq, sql } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import {
  auditEvents,
  integrationDestinations,
  integrationRuns,
  workspaceIntegrations,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { siteConfig } from "../config/site";
import { getEffectiveWorkspaceTier } from "../workspaces/service";
import { decryptSecret, encryptSecret } from "./crypto";
import {
  INTEGRATION_PROVIDER_IDS,
  INTEGRATION_PROVIDERS,
  normalizeIntegrationSettings,
  type IntegrationProviderId,
  type IntegrationSettings,
} from "./providers";

export type ServiceError = { error: string; [key: string]: unknown };
// "oauth": an MCP client (Claude, ChatGPT, …) acting with an OAuth access token.
export type AuthMethod = "session" | "api_key" | "oauth";

/** Who's asking, for permission checks and the run ledger. */
export type IntegrationActor = {
  userId: string;
  authMethod: AuthMethod;
  client?: string | null;
};

export type IntegrationAccess = {
  workspace: { id: string; slug: string; name: string };
  role: "owner" | "admin" | "member";
  tier: string;
  settings: IntegrationSettings;
  /** May connect, disconnect, name folders and change settings. */
  canManage: boolean;
  /** May save documents and request signatures. */
  canUse: boolean;
};

export function isServiceError(value: unknown): value is ServiceError {
  return typeof (value as { error?: unknown } | null)?.error === "string";
}

/** BETTER_AUTH_URL is the web app's address in every deployment (and localhost in dev). */
export function webAppUrl(): string {
  return (process.env.BETTER_AUTH_URL || siteConfig.url).replace(/\/$/, "");
}

export function dashboardIntegrationsUrl(): string {
  return `${webAppUrl()}/dashboard/integrations`;
}

/**
 * Membership, plan and settings for one workspace. Integrations are a Pro
 * and Team feature: Free workspaces get `plan_required`.
 */
export async function getIntegrationAccess(
  userId: string,
  workspaceId: string,
): Promise<IntegrationAccess | ServiceError> {
  const database = getDbOrThrow();
  const [row] = await database
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      name: workspaces.name,
      integrationsUsableBy: workspaces.integrationsUsableBy,
      signatureConfirmation: workspaces.signatureConfirmation,
      role: workspaceMembers.role,
    })
    .from(workspaces)
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, workspaces.id),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active"),
      ),
    )
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!row) return { error: "not_found" };

  const tier = (await getEffectiveWorkspaceTier(workspaceId)) ?? "free";
  const settings = normalizeIntegrationSettings(row);
  const paid = tier === "pro" || tier === "team";
  const isAdmin = row.role === "owner" || row.role === "admin";
  return {
    workspace: { id: row.id, slug: row.slug, name: row.name },
    role: row.role,
    tier,
    settings,
    canManage: paid && isAdmin,
    canUse: paid && (isAdmin || settings.usableBy === "members"),
  };
}

/** Access for an action, or the error to return. */
export async function requireIntegrationAccess(
  userId: string,
  workspaceId: string,
  need: "use" | "manage" | "view",
): Promise<IntegrationAccess | ServiceError> {
  const access = await getIntegrationAccess(userId, workspaceId);
  if (isServiceError(access)) return access;
  if (access.tier !== "pro" && access.tier !== "team") {
    return { error: "plan_required", tier: access.tier };
  }
  if (need === "manage" && !access.canManage) {
    return { error: "forbidden", reason: "admins_only" };
  }
  if (need === "use" && !access.canUse) {
    return { error: "forbidden", reason: "integrations_admins_only" };
  }
  return access;
}

// ---- Connections ------------------------------------------------------

export type StoredConnection<C = Record<string, unknown>, S = Record<string, unknown>> = {
  id: string;
  workspaceId: string;
  provider: IntegrationProviderId;
  status: string;
  accountLabel: string | null;
  config: C;
  credentials: S;
  lastError: string | null;
  connectedAt: Date;
};

export async function getConnection<C = Record<string, unknown>, S = Record<string, unknown>>(
  workspaceId: string,
  provider: IntegrationProviderId,
): Promise<StoredConnection<C, S> | null> {
  const database = getDbOrThrow();
  const [row] = await database
    .select()
    .from(workspaceIntegrations)
    .where(
      and(
        eq(workspaceIntegrations.workspaceId, workspaceId),
        eq(workspaceIntegrations.provider, provider),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider,
    status: row.status,
    accountLabel: row.accountLabel,
    config: row.config as C,
    credentials: decryptSecret<S>(row.credentials),
    lastError: row.lastError,
    connectedAt: row.connectedAt,
  };
}

export async function getConnectionById<C = Record<string, unknown>, S = Record<string, unknown>>(
  integrationId: string,
): Promise<StoredConnection<C, S> | null> {
  const database = getDbOrThrow();
  const [row] = await database
    .select({ workspaceId: workspaceIntegrations.workspaceId, provider: workspaceIntegrations.provider })
    .from(workspaceIntegrations)
    .where(eq(workspaceIntegrations.id, integrationId))
    .limit(1);
  if (!row) return null;
  return getConnection<C, S>(row.workspaceId, row.provider as IntegrationProviderId);
}

/** Create or replace a workspace's connection to a provider. */
export async function saveConnection(input: {
  workspaceId: string;
  provider: IntegrationProviderId;
  accountLabel: string | null;
  config: Record<string, unknown>;
  credentials: Record<string, unknown>;
  userId: string;
}): Promise<{ id: string }> {
  const database = getDbOrThrow();
  const values = {
    status: "connected",
    accountLabel: input.accountLabel,
    config: input.config,
    credentials: encryptSecret(input.credentials),
    lastError: null,
    connectedByUserId: input.userId,
    connectedAt: new Date(),
    updatedAt: new Date(),
  };
  const [row] = await database
    .insert(workspaceIntegrations)
    .values({ workspaceId: input.workspaceId, provider: input.provider, ...values })
    .onConflictDoUpdate({
      target: [workspaceIntegrations.workspaceId, workspaceIntegrations.provider],
      set: values,
    })
    .returning({ id: workspaceIntegrations.id });
  await recordAudit(input.workspaceId, input.userId, "integration_connected", {
    provider: input.provider,
    account: input.accountLabel,
  });
  return { id: row.id };
}

/** Update a connection's credentials (e.g. a rotated token) without touching anything else. */
export async function updateConnectionCredentials(
  integrationId: string,
  credentials: Record<string, unknown>,
): Promise<void> {
  const database = getDbOrThrow();
  await database
    .update(workspaceIntegrations)
    .set({ credentials: encryptSecret(credentials), updatedAt: new Date() })
    .where(eq(workspaceIntegrations.id, integrationId));
}

/** The provider rejected our credentials: show "reconnect" until fixed. */
export async function markConnectionError(integrationId: string, message: string): Promise<void> {
  const database = getDbOrThrow();
  await database
    .update(workspaceIntegrations)
    .set({ status: "error", lastError: message.slice(0, 500), updatedAt: new Date() })
    .where(eq(workspaceIntegrations.id, integrationId));
}

export async function deleteConnection(
  workspaceId: string,
  provider: IntegrationProviderId,
  userId: string,
): Promise<boolean> {
  const database = getDbOrThrow();
  const deleted = await database
    .delete(workspaceIntegrations)
    .where(
      and(
        eq(workspaceIntegrations.workspaceId, workspaceId),
        eq(workspaceIntegrations.provider, provider),
      ),
    )
    .returning({ id: workspaceIntegrations.id });
  if (deleted.length > 0) {
    await recordAudit(workspaceId, userId, "integration_disconnected", { provider });
  }
  return deleted.length > 0;
}

// ---- Settings ---------------------------------------------------------

export async function updateIntegrationSettings(
  userId: string,
  workspaceId: string,
  input: Partial<IntegrationSettings>,
): Promise<IntegrationSettings | ServiceError> {
  const access = await requireIntegrationAccess(userId, workspaceId, "manage");
  if (isServiceError(access)) return access;
  const next: IntegrationSettings = { ...access.settings, ...input };
  if (next.usableBy !== "members" && next.usableBy !== "admins") return { error: "invalid_settings" };
  if (next.signatureConfirmation !== "chat" && next.signatureConfirmation !== "browser") {
    return { error: "invalid_settings" };
  }
  const database = getDbOrThrow();
  await database
    .update(workspaces)
    .set({
      integrationsUsableBy: next.usableBy,
      signatureConfirmation: next.signatureConfirmation,
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId));
  await recordAudit(workspaceId, userId, "integration_settings_changed", { ...next });
  return next;
}

// ---- Destinations -----------------------------------------------------

export type Destination = {
  id: string;
  name: string;
  folderName: string | null;
  driveName: string | null;
  url: string | null;
  externalId: string;
  driveId: string | null;
  integrationId: string;
};

function shapeDestination(row: typeof integrationDestinations.$inferSelect): Destination {
  return {
    id: row.id,
    name: row.name,
    folderName: row.externalName,
    driveName: row.driveName,
    url: row.url,
    externalId: row.externalId,
    driveId: row.driveId,
    integrationId: row.integrationId,
  };
}

export async function listDestinations(workspaceId: string): Promise<Destination[]> {
  const database = getDbOrThrow();
  const rows = await database
    .select()
    .from(integrationDestinations)
    .where(eq(integrationDestinations.workspaceId, workspaceId))
    .orderBy(asc(integrationDestinations.name));
  return rows.map(shapeDestination);
}

/** A destination by id or by name (case-insensitive), or the names to choose from. */
export async function resolveDestination(
  workspaceId: string,
  nameOrId: string,
): Promise<Destination | ServiceError> {
  const wanted = nameOrId.trim().toLowerCase();
  const all = await listDestinations(workspaceId);
  const match =
    all.find((d) => d.id === nameOrId.trim()) ?? all.find((d) => d.name.toLowerCase() === wanted);
  if (match) return match;
  return { error: "destination_not_found", destination: nameOrId, destinations: all.map((d) => d.name) };
}

export const MAX_DESTINATION_NAME = 80;

export async function addDestination(input: {
  workspaceId: string;
  integrationId: string;
  userId: string;
  name: string;
  externalId: string;
  externalName: string | null;
  driveId: string | null;
  driveName: string | null;
  url: string | null;
}): Promise<Destination | ServiceError> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_DESTINATION_NAME) return { error: "invalid_name" };
  const existing = await listDestinations(input.workspaceId);
  if (existing.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
    return { error: "name_taken", name };
  }
  const database = getDbOrThrow();
  const [row] = await database
    .insert(integrationDestinations)
    .values({ ...input, name, createdByUserId: input.userId })
    .returning();
  return shapeDestination(row);
}

export async function renameDestination(
  workspaceId: string,
  destinationId: string,
  rawName: string,
): Promise<Destination | ServiceError> {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_DESTINATION_NAME) return { error: "invalid_name" };
  const existing = await listDestinations(workspaceId);
  if (existing.some((d) => d.id !== destinationId && d.name.toLowerCase() === name.toLowerCase())) {
    return { error: "name_taken", name };
  }
  const database = getDbOrThrow();
  const [row] = await database
    .update(integrationDestinations)
    .set({ name })
    .where(
      and(
        eq(integrationDestinations.id, destinationId),
        eq(integrationDestinations.workspaceId, workspaceId),
      ),
    )
    .returning();
  return row ? shapeDestination(row) : { error: "not_found" };
}

export async function removeDestination(workspaceId: string, destinationId: string): Promise<boolean> {
  const database = getDbOrThrow();
  const deleted = await database
    .delete(integrationDestinations)
    .where(
      and(
        eq(integrationDestinations.id, destinationId),
        eq(integrationDestinations.workspaceId, workspaceId),
      ),
    )
    .returning({ id: integrationDestinations.id });
  return deleted.length > 0;
}

// ---- Overview ---------------------------------------------------------

export type IntegrationStatus = {
  provider: IntegrationProviderId;
  name: string;
  description: string;
  capabilities: string[];
  status: "connected" | "not_connected" | "error";
  account: string | null;
  connectedAt: string | null;
  error?: string;
  region?: string | null;
  destinations?: Array<Omit<Destination, "externalId" | "integrationId" | "driveId">>;
};

/** Everything the dashboard and agents need to know about a workspace's integrations. */
export async function getIntegrationsOverview(userId: string, workspaceId: string) {
  const access = await requireIntegrationAccess(userId, workspaceId, "view");
  if (isServiceError(access)) return access;

  const database = getDbOrThrow();
  const rows = await database
    .select({
      provider: workspaceIntegrations.provider,
      status: workspaceIntegrations.status,
      accountLabel: workspaceIntegrations.accountLabel,
      config: workspaceIntegrations.config,
      lastError: workspaceIntegrations.lastError,
      connectedAt: workspaceIntegrations.connectedAt,
    })
    .from(workspaceIntegrations)
    .where(eq(workspaceIntegrations.workspaceId, workspaceId));
  const destinations = await listDestinations(workspaceId);

  const integrations: IntegrationStatus[] = INTEGRATION_PROVIDER_IDS.map((id) => {
    const provider = INTEGRATION_PROVIDERS[id];
    const row = rows.find((r) => r.provider === id);
    const base: IntegrationStatus = {
      provider: id,
      name: provider.name,
      description: provider.description,
      capabilities: provider.capabilities,
      status: row ? (row.status === "error" ? "error" : "connected") : "not_connected",
      account: row?.accountLabel ?? null,
      connectedAt: row?.connectedAt.toISOString() ?? null,
      ...(row?.status === "error" && row.lastError ? { error: row.lastError } : {}),
    };
    if (id === "docuseal") {
      base.region = row ? String((row.config as { region?: string }).region ?? "com") : null;
    }
    if (provider.capabilities.includes("storage")) {
      base.destinations = row
        ? destinations.map(({ id: destId, name, folderName, driveName, url }) => ({
            id: destId,
            name,
            folderName,
            driveName,
            url,
          }))
        : [];
    }
    return base;
  });

  return {
    workspace: access.workspace,
    tier: access.tier,
    role: access.role,
    canManage: access.canManage,
    canUse: access.canUse,
    settings: access.settings,
    dashboardUrl: dashboardIntegrationsUrl(),
    integrations,
  };
}

// ---- Ledger and audit -------------------------------------------------

export async function recordRun(input: {
  workspaceId: string;
  integrationId: string | null;
  provider: IntegrationProviderId;
  action: string;
  status: "succeeded" | "failed";
  actor: IntegrationActor | null;
  postId?: string | null;
  postVersionNumber?: number | null;
  signatureRequestId?: string | null;
  destinationId?: string | null;
  request?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string | null;
}): Promise<string> {
  const database = getDbOrThrow();
  const [row] = await database
    .insert(integrationRuns)
    .values({
      workspaceId: input.workspaceId,
      integrationId: input.integrationId,
      provider: input.provider,
      action: input.action,
      status: input.status,
      postId: input.postId ?? null,
      postVersionNumber: input.postVersionNumber ?? null,
      signatureRequestId: input.signatureRequestId ?? null,
      destinationId: input.destinationId ?? null,
      actorUserId: input.actor?.userId ?? null,
      authMethod: input.actor?.authMethod ?? null,
      client: input.actor?.client?.slice(0, 120) ?? null,
      request: input.request,
      result: input.result,
      error: input.error ?? null,
    })
    .returning({ id: integrationRuns.id });
  return row.id;
}

type IntegrationAuditEvent =
  | "integration_connected"
  | "integration_disconnected"
  | "integration_settings_changed"
  | "document_saved_to_storage"
  | "signature_requested"
  | "signature_sent"
  | "signature_completed"
  | "signature_cancelled";

export async function recordAudit(
  workspaceId: string,
  actorUserId: string | null,
  eventType: IntegrationAuditEvent,
  metadata: Record<string, unknown>,
  postId?: string | null,
): Promise<void> {
  const database = getDbOrThrow();
  await database.insert(auditEvents).values({
    workspaceId,
    actorUserId,
    postId: postId ?? null,
    eventType,
    metadata,
  });
}

/** Lower-cased email domains of the workspace's active members. */
export async function getWorkspaceEmailDomains(workspaceId: string): Promise<Set<string>> {
  const database = getDbOrThrow();
  const rows = await database.execute<{ domain: string }>(sql`
    select distinct lower(split_part(u.email, '@', 2)) as domain
    from workspace_members m join "user" u on u.id = m.user_id
    where m.workspace_id = ${workspaceId} and m.status = 'active'
  `);
  return new Set(
    (Array.isArray(rows) ? rows : (rows as { rows: Array<{ domain: string }> }).rows).map((r) => r.domain),
  );
}
