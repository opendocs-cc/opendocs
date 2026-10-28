/**
 * Saving files to a workspace's named destinations (today: Google Drive
 * folders). Every save is recorded in integration_runs with our SHA-256
 * and the one Drive reports back, so there's a record of exactly which
 * bytes went where, when, and at whose request.
 */
import { createHash } from "node:crypto";

import {
  DriveApiError,
  ReconnectRequiredError,
  getGoogleAccessToken,
  lockDriveFile,
  uploadDriveFile,
  type GoogleDriveConfig,
  type GoogleDriveCredentials,
} from "./google-drive";
import type { StorageFormat } from "./providers";
import {
  getConnection,
  isServiceError,
  recordAudit,
  recordRun,
  requireIntegrationAccess,
  resolveDestination,
  type Destination,
  type IntegrationActor,
  type ServiceError,
} from "./service";

export const STORAGE_MIME_TYPES: Record<StorageFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown",
};

export type StoredFile = {
  id: string;
  name: string;
  url: string;
  bytes: number;
  sha256: string;
  driveSha256: string | null;
  /** Drive's checksum matches ours. False only if Drive reported a different one. */
  verified: boolean;
  locked?: boolean;
};

export function sha256Hex(body: Buffer | string): string {
  return createHash("sha256").update(body).digest("hex");
}

/** A filename Drive (and people) will be happy with. */
export function safeFileName(name: string, ext: string): string {
  const base = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return `${base || "document"}.${ext}`;
}

/**
 * Upload one file to a destination. The caller has already checked the
 * actor may read the document; this checks they may use integrations.
 */
export async function saveFileToDestination(input: {
  actor: IntegrationActor | null;
  workspaceId: string;
  destination: string | Destination;
  file: { name: string; mimeType: string; body: Buffer };
  appProperties: Record<string, string>;
  description?: string;
  lock?: string | null;
  ledger: {
    action: string;
    postId?: string | null;
    postVersionNumber?: number | null;
    signatureRequestId?: string | null;
    request?: Record<string, unknown>;
  };
}): Promise<{ destination: Destination; file: StoredFile; runId: string } | ServiceError> {
  if (input.actor) {
    const access = await requireIntegrationAccess(input.actor.userId, input.workspaceId, "use");
    if (isServiceError(access)) return access;
  }
  const connection = await getConnection<GoogleDriveConfig, GoogleDriveCredentials>(
    input.workspaceId,
    "google_drive",
  );
  if (!connection) return { error: "integration_not_connected", provider: "google_drive" };
  if (connection.status === "error") {
    return { error: "reconnect_required", provider: "google_drive", message: connection.lastError ?? undefined };
  }

  const destination =
    typeof input.destination === "string"
      ? await resolveDestination(input.workspaceId, input.destination)
      : input.destination;
  if (isServiceError(destination)) return destination;

  const sha256 = sha256Hex(input.file.body);
  const runBase = {
    workspaceId: input.workspaceId,
    integrationId: connection.id,
    provider: "google_drive" as const,
    action: input.ledger.action,
    actor: input.actor,
    postId: input.ledger.postId,
    postVersionNumber: input.ledger.postVersionNumber,
    signatureRequestId: input.ledger.signatureRequestId,
    destinationId: destination.id,
    request: { ...input.ledger.request, destination: destination.name, fileName: input.file.name, sha256 },
  };

  try {
    const accessToken = await getGoogleAccessToken(connection);
    const uploaded = await uploadDriveFile(accessToken, {
      folderId: destination.externalId,
      name: input.file.name,
      mimeType: input.file.mimeType,
      body: input.file.body,
      appProperties: input.appProperties,
      description: input.description,
    });
    const locked = input.lock ? await lockDriveFile(accessToken, uploaded.id, input.lock) : undefined;
    const file: StoredFile = {
      id: uploaded.id,
      name: uploaded.name,
      url: uploaded.url,
      bytes: input.file.body.length,
      sha256,
      driveSha256: uploaded.sha256Checksum,
      verified: uploaded.sha256Checksum ? uploaded.sha256Checksum === sha256 : true,
      ...(locked !== undefined ? { locked } : {}),
    };
    const runId = await recordRun({
      ...runBase,
      status: "succeeded",
      result: {
        fileId: uploaded.id,
        name: uploaded.name,
        url: uploaded.url,
        sha256,
        driveSha256: uploaded.sha256Checksum,
        driveMd5: uploaded.md5Checksum,
        headRevisionId: uploaded.headRevisionId,
        createdTime: uploaded.createdTime,
        folderId: destination.externalId,
        driveId: destination.driveId,
        account: connection.config.email,
        ...(locked !== undefined ? { locked } : {}),
      },
    });
    await recordAudit(
      input.workspaceId,
      input.actor?.userId ?? null,
      "document_saved_to_storage",
      { provider: "google_drive", destination: destination.name, fileId: uploaded.id, sha256, action: input.ledger.action },
      input.ledger.postId,
    );
    return { destination, file, runId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordRun({ ...runBase, status: "failed", error: message });
    if (err instanceof ReconnectRequiredError) {
      return { error: "reconnect_required", provider: "google_drive" };
    }
    if (err instanceof DriveApiError && (err.status === 404 || err.status === 403)) {
      return {
        error: "destination_unavailable",
        destination: destination.name,
        message: `Google Drive refused access to "${destination.name}" (${err.message}). Pick the folder again in the dashboard, or check the connected account can add files to it.`,
      };
    }
    return { error: "storage_failed", message };
  }
}
