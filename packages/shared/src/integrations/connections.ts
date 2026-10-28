/**
 * Connecting and disconnecting providers, and naming Drive folders. All of
 * this is owner/admin only and happens in the dashboard (session auth);
 * agents only read the result through getIntegrationsOverview.
 */
import { DocuSealApiError, docuSealBaseUrl, verifyDocuSealKey, type DocuSealCredentials } from "./docuseal";
import {
  DriveApiError,
  ReconnectRequiredError,
  exchangeGoogleDriveCode,
  getDriveFolder,
  getGoogleAccessToken,
  getGoogleDriveOAuthConfig,
  revokeGoogleToken,
  type GoogleDriveConfig,
  type GoogleDriveConnection,
  type GoogleDriveCredentials,
} from "./google-drive";
import type { DocuSealRegion, IntegrationProviderId } from "./providers";
import {
  addDestination,
  deleteConnection,
  getConnection,
  isServiceError,
  removeDestination,
  renameDestination,
  requireIntegrationAccess,
  saveConnection,
  updateConnectionCredentials,
  type ServiceError,
} from "./service";
import { webhookToken } from "./signatures";

// ---- DocuSeal -----------------------------------------------------------

export async function connectDocuSeal(
  userId: string,
  workspaceId: string,
  input: { region: DocuSealRegion; customUrl?: string | null; apiKey: string; webhookSecret?: string | null },
): Promise<{ account: string | null; region: DocuSealRegion } | ServiceError> {
  const access = await requireIntegrationAccess(userId, workspaceId, "manage");
  if (isServiceError(access)) return access;

  const baseUrl = docuSealBaseUrl(input.region, input.customUrl);
  if (!baseUrl) return { error: "invalid_url", message: "Enter your DocuSeal instance's https:// address." };
  const apiKey = input.apiKey.trim();
  if (!apiKey) return { error: "invalid_key", message: "Paste your DocuSeal API key." };

  let account: string | null;
  try {
    ({ account } = await verifyDocuSealKey(baseUrl, apiKey));
  } catch (err) {
    if (err instanceof DocuSealApiError && (err.status === 401 || err.status === 403)) {
      return {
        error: "invalid_key",
        message:
          input.region === "custom"
            ? "DocuSeal didn't accept that key. Check the key and your instance's address."
            : `DocuSeal didn't accept that key on docuseal.${input.region}. Check the key, and that your account is on docuseal.${input.region}.`,
      };
    }
    return { error: "provider_unreachable", message: `Couldn't reach DocuSeal: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Keep the webhook token across reconnects so the URL in DocuSeal stays valid.
  const existing = await getConnection<unknown, DocuSealCredentials & { webhookToken?: string }>(workspaceId, "docuseal").catch(
    () => null,
  );
  await saveConnection({
    workspaceId,
    provider: "docuseal",
    accountLabel: account,
    config: { region: input.region, baseUrl },
    credentials: {
      apiKey,
      webhookSecret: input.webhookSecret?.trim() || existing?.credentials.webhookSecret || null,
      webhookToken: existing?.credentials.webhookToken ?? webhookToken(),
    },
    userId,
  });
  return { account, region: input.region };
}

/** Save or clear DocuSeal's webhook signing secret (whsec_…). */
export async function updateDocuSealWebhookSecret(
  userId: string,
  workspaceId: string,
  secret: string | null,
): Promise<{ ok: true } | ServiceError> {
  const access = await requireIntegrationAccess(userId, workspaceId, "manage");
  if (isServiceError(access)) return access;
  const connection = await getConnection<Record<string, unknown>, DocuSealCredentials & { webhookToken?: string }>(
    workspaceId,
    "docuseal",
  );
  if (!connection) return { error: "integration_not_connected", provider: "docuseal" };
  await updateConnectionCredentials(connection.id, {
    ...connection.credentials,
    webhookSecret: secret?.trim() || null,
  });
  return { ok: true };
}

/** What the dashboard shows for DocuSeal: the webhook URL to paste into DocuSeal, and whether a secret is saved. */
export async function getDocuSealSetup(
  workspaceId: string,
  apiBaseUrl: string,
): Promise<{ webhookUrl: string; hasWebhookSecret: boolean } | null> {
  const connection = await getConnection<Record<string, unknown>, DocuSealCredentials & { webhookToken?: string }>(
    workspaceId,
    "docuseal",
  ).catch(() => null);
  if (!connection?.credentials.webhookToken) return null;
  return {
    webhookUrl: `${apiBaseUrl.replace(/\/$/, "")}/api/v1/integrations/docuseal/webhook/${connection.id}?token=${connection.credentials.webhookToken}`,
    hasWebhookSecret: Boolean(connection.credentials.webhookSecret),
  };
}

// ---- Google Drive -------------------------------------------------------

export async function completeGoogleDriveConnection(
  userId: string,
  workspaceId: string,
  input: { code: string; redirectUri: string },
): Promise<{ account: string } | ServiceError> {
  const access = await requireIntegrationAccess(userId, workspaceId, "manage");
  if (isServiceError(access)) return access;
  const exchanged = await exchangeGoogleDriveCode(input).catch((err: unknown) => ({
    error: "oauth_failed" as const,
    message: err instanceof Error ? err.message : String(err),
  }));
  if ("error" in exchanged) return exchanged as ServiceError;

  const previous = await getConnection<GoogleDriveConfig, GoogleDriveCredentials>(workspaceId, "google_drive").catch(
    () => null,
  );
  await saveConnection({
    workspaceId,
    provider: "google_drive",
    accountLabel: exchanged.config.email || null,
    config: exchanged.config,
    credentials: exchanged.credentials,
    userId,
  });
  // A different Google account can't see folders the old one picked.
  if (previous && previous.config.sub && previous.config.sub !== exchanged.config.sub) {
    await revokeGoogleToken(previous.credentials.refreshToken);
  }
  return { account: exchanged.config.email };
}

/** What the browser needs to open the Google Picker. */
export async function getDrivePickerConfig(
  userId: string,
  workspaceId: string,
): Promise<{ accessToken: string; apiKey: string; appId: string; account: string } | ServiceError> {
  const access = await requireIntegrationAccess(userId, workspaceId, "manage");
  if (isServiceError(access)) return access;
  const oauth = getGoogleDriveOAuthConfig();
  if (!oauth?.pickerApiKey || !oauth.appId) {
    return { error: "not_configured", message: "The Google Picker isn't configured on this server (GOOGLE_PICKER_API_KEY, GOOGLE_CLOUD_PROJECT_NUMBER)." };
  }
  const connection = (await getConnection<GoogleDriveConfig, GoogleDriveCredentials>(
    workspaceId,
    "google_drive",
  )) as GoogleDriveConnection | null;
  if (!connection) return { error: "integration_not_connected", provider: "google_drive" };
  try {
    return {
      accessToken: await getGoogleAccessToken(connection),
      apiKey: oauth.pickerApiKey,
      appId: oauth.appId,
      account: connection.config.email,
    };
  } catch (err) {
    if (err instanceof ReconnectRequiredError) return { error: "reconnect_required", provider: "google_drive" };
    throw err;
  }
}

/** Name a folder the user just picked, after checking OpenDocs can use it. */
export async function addDriveFolder(
  userId: string,
  workspaceId: string,
  input: { folderId: string; name: string },
) {
  const access = await requireIntegrationAccess(userId, workspaceId, "manage");
  if (isServiceError(access)) return access;
  const connection = (await getConnection<GoogleDriveConfig, GoogleDriveCredentials>(
    workspaceId,
    "google_drive",
  )) as GoogleDriveConnection | null;
  if (!connection) return { error: "integration_not_connected", provider: "google_drive" } as ServiceError;

  try {
    const folder = await getDriveFolder(await getGoogleAccessToken(connection), input.folderId);
    if (!folder.canAddChildren) {
      return {
        error: "folder_read_only",
        message: `${connection.config.email} can't add files to "${folder.name}". Use a folder where that account is a Contributor or above.`,
      } as ServiceError;
    }
    return addDestination({
      workspaceId,
      integrationId: connection.id,
      userId,
      name: input.name || folder.name,
      externalId: folder.id,
      externalName: folder.name,
      driveId: folder.driveId,
      driveName: folder.driveName,
      url: folder.url,
    });
  } catch (err) {
    if (err instanceof ReconnectRequiredError) return { error: "reconnect_required", provider: "google_drive" } as ServiceError;
    if (err instanceof DriveApiError) return { error: "folder_unavailable", message: err.message } as ServiceError;
    throw err;
  }
}

export async function renameDriveFolder(userId: string, workspaceId: string, destinationId: string, name: string) {
  const access = await requireIntegrationAccess(userId, workspaceId, "manage");
  if (isServiceError(access)) return access;
  return renameDestination(workspaceId, destinationId, name);
}

export async function removeDriveFolder(userId: string, workspaceId: string, destinationId: string) {
  const access = await requireIntegrationAccess(userId, workspaceId, "manage");
  if (isServiceError(access)) return access;
  return (await removeDestination(workspaceId, destinationId)) ? { ok: true as const } : ({ error: "not_found" } as ServiceError);
}

// ---- Disconnect ---------------------------------------------------------

export async function disconnectIntegration(
  userId: string,
  workspaceId: string,
  provider: IntegrationProviderId,
): Promise<{ ok: true } | ServiceError> {
  const access = await requireIntegrationAccess(userId, workspaceId, "manage");
  if (isServiceError(access)) return access;
  if (provider === "google_drive") {
    const connection = await getConnection<GoogleDriveConfig, GoogleDriveCredentials>(workspaceId, "google_drive").catch(
      () => null,
    );
    if (connection) await revokeGoogleToken(connection.credentials.refreshToken);
  }
  // Named folders go with the connection (FK cascade).
  return (await deleteConnection(workspaceId, provider, userId)) ? { ok: true } : { error: "not_found" };
}
