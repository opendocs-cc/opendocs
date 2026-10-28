/**
 * Google Drive: a workspace-level OAuth connection with the `drive.file`
 * scope. OpenDocs can only see files it created and folders the user
 * picked with the Google Picker, which keeps the scope non-sensitive (no
 * Google security assessment) and means OpenDocs never browses anyone's
 * Drive.
 *
 * Env (one OAuth client, separate from "Sign in with Google", in the same
 * Google Cloud project as the Picker API key):
 *   GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET
 *   GOOGLE_PICKER_API_KEY           — browser key for the Picker
 *   GOOGLE_CLOUD_PROJECT_NUMBER     — the Picker's app ID
 * Redirect URI: <web app>/dashboard/integrations/google-drive/callback
 */
import { createHash } from "node:crypto";

import { markConnectionError, updateConnectionCredentials, type StoredConnection } from "./service";

export const GOOGLE_DRIVE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.file",
];

export type GoogleDriveCredentials = { refreshToken: string };
export type GoogleDriveConfig = { email: string; sub: string; scopes: string[] };
export type GoogleDriveConnection = StoredConnection<GoogleDriveConfig, GoogleDriveCredentials>;

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const MULTIPART_LIMIT = 5 * 1024 * 1024;

export class ReconnectRequiredError extends Error {
  constructor(message = "Google Drive access was revoked or expired. Reconnect it in the dashboard.") {
    super(message);
    this.name = "ReconnectRequiredError";
  }
}

export class DriveApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "DriveApiError";
  }
}

export function getGoogleDriveOAuthConfig() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    pickerApiKey: process.env.GOOGLE_PICKER_API_KEY?.trim() || null,
    appId: process.env.GOOGLE_CLOUD_PROJECT_NUMBER?.trim() || null,
  };
}

export function isGoogleDriveConfigured(): boolean {
  return getGoogleDriveOAuthConfig() !== null;
}

function requireOAuthConfig() {
  const config = getGoogleDriveOAuthConfig();
  if (!config) {
    throw new Error("Google Drive isn't configured: set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET.");
  }
  return config;
}

// ---- OAuth ------------------------------------------------------------

export function buildGoogleDriveAuthUrl(input: { redirectUri: string; state: string; loginHint?: string }) {
  const { clientId } = requireOAuthConfig();
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_DRIVE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  // Always ask, so Google returns a refresh token even on a reconnect, and
  // let people pick the account that has the shared drives.
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function postToken(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok) {
    if (body.error === "invalid_grant") throw new ReconnectRequiredError();
    throw new Error(`Google token request failed (${res.status}): ${body.error_description ?? body.error ?? "unknown"}`);
  }
  return body;
}

/** Exchange the consent code. Returns what to store for the connection. */
export async function exchangeGoogleDriveCode(input: { code: string; redirectUri: string }) {
  const { clientId, clientSecret } = requireOAuthConfig();
  const tokens = await postToken({
    code: input.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });
  const scopes = (tokens.scope ?? "").split(/\s+/).filter(Boolean);
  if (!scopes.includes("https://www.googleapis.com/auth/drive.file")) {
    return { error: "scope_not_granted" as const };
  }
  if (!tokens.refresh_token) return { error: "no_refresh_token" as const };
  // The ID token comes straight from Google's token endpoint over TLS, so
  // its claims can be read without verifying the signature.
  const claims = tokens.id_token ? decodeJwtPayload(tokens.id_token) : {};
  return {
    config: { email: String(claims.email ?? ""), sub: String(claims.sub ?? ""), scopes },
    credentials: { refreshToken: tokens.refresh_token },
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in,
  };
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}

// Access tokens live an hour; keep them per connection, keyed by the
// refresh token so a reconnect never reuses a stale one.
const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getGoogleAccessToken(connection: GoogleDriveConnection): Promise<string> {
  const cacheKey = `${connection.id}:${createHash("sha256").update(connection.credentials.refreshToken).digest("hex")}`;
  const cached = accessTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const { clientId, clientSecret } = requireOAuthConfig();
  try {
    const tokens = await postToken({
      refresh_token: connection.credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    });
    accessTokenCache.set(cacheKey, { token: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 });
    if (tokens.refresh_token && tokens.refresh_token !== connection.credentials.refreshToken) {
      await updateConnectionCredentials(connection.id, { refreshToken: tokens.refresh_token });
    }
    return tokens.access_token;
  } catch (err) {
    if (err instanceof ReconnectRequiredError) {
      await markConnectionError(connection.id, "Google Drive access was revoked or expired. Reconnect it.");
    }
    throw err;
  }
}

// ---- Drive API --------------------------------------------------------

async function driveFetch(accessToken: string, url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) },
  });
  // Back off on rate limits and server errors, as Google recommends.
  const retryable = res.status === 429 || res.status >= 500;
  let reason: string | undefined;
  if (res.status === 403) {
    const body = (await res.clone().json().catch(() => null)) as {
      error?: { errors?: Array<{ reason?: string }> };
    } | null;
    reason = body?.error?.errors?.[0]?.reason;
  }
  const rateLimited = reason === "rateLimitExceeded" || reason === "userRateLimitExceeded";
  if ((retryable || rateLimited) && attempt < 4 && !(init.body instanceof ReadableStream)) {
    await new Promise((r) => setTimeout(r, Math.min(2 ** attempt * 1000 + Math.random() * 500, 16_000)));
    return driveFetch(accessToken, url, init, attempt + 1);
  }
  if (res.status === 401) throw new ReconnectRequiredError();
  return res;
}

async function driveJson<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
  const res = await driveFetch(accessToken, url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; errors?: Array<{ reason?: string }> } };
  if (!res.ok) {
    throw new DriveApiError(body.error?.message ?? `Drive request failed (${res.status})`, res.status, body.error?.errors?.[0]?.reason);
  }
  return body;
}

export type DriveFolder = {
  id: string;
  name: string;
  driveId: string | null;
  driveName: string | null;
  url: string;
  canAddChildren: boolean;
};

/** Details of a folder the user picked. Fails if OpenDocs can't see it. */
export async function getDriveFolder(accessToken: string, folderId: string): Promise<DriveFolder> {
  const file = await driveJson<{
    id: string;
    name: string;
    mimeType: string;
    driveId?: string;
    webViewLink?: string;
    capabilities?: { canAddChildren?: boolean };
  }>(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(folderId)}?supportsAllDrives=true&fields=id,name,mimeType,driveId,webViewLink,capabilities(canAddChildren)`,
  );
  if (file.mimeType !== "application/vnd.google-apps.folder") {
    throw new DriveApiError("That isn't a folder.", 400, "notAFolder");
  }
  let driveName: string | null = null;
  if (file.driveId) {
    // drives.get may need more than drive.file; the name is only cosmetic.
    driveName = await driveJson<{ name: string }>(
      accessToken,
      `${DRIVE_API}/drives/${encodeURIComponent(file.driveId)}?fields=name`,
    )
      .then((d) => d.name)
      .catch(() => null);
  }
  return {
    id: file.id,
    name: file.name,
    driveId: file.driveId ?? null,
    driveName,
    url: file.webViewLink ?? `https://drive.google.com/drive/folders/${file.id}`,
    canAddChildren: file.capabilities?.canAddChildren !== false,
  };
}

export type UploadedDriveFile = {
  id: string;
  name: string;
  url: string;
  sha256Checksum: string | null;
  md5Checksum: string | null;
  headRevisionId: string | null;
  createdTime: string | null;
  size: number;
};

const FILE_FIELDS = "id,name,webViewLink,sha256Checksum,md5Checksum,headRevisionId,createdTime,size";

/**
 * Upload a new file into a folder. The file ID is generated first and the
 * upload uses it, so a retried request returns 409 instead of creating a
 * duplicate. Files stay binary (no Google Docs conversion) so Drive
 * reports checksums, and the first revision is kept forever.
 */
export async function uploadDriveFile(
  accessToken: string,
  input: {
    folderId: string;
    name: string;
    mimeType: string;
    body: Buffer;
    appProperties?: Record<string, string>;
    description?: string;
  },
): Promise<UploadedDriveFile> {
  const { ids } = await driveJson<{ ids: string[] }>(
    accessToken,
    `${DRIVE_API}/files/generateIds?count=1&space=drive&type=files`,
  );
  const id = ids[0];
  const metadata = {
    id,
    name: input.name,
    parents: [input.folderId],
    mimeType: input.mimeType,
    ...(input.description ? { description: input.description } : {}),
    ...(input.appProperties ? { appProperties: input.appProperties } : {}),
  };
  const query = `supportsAllDrives=true&keepRevisionForever=true&fields=${FILE_FIELDS}`;

  let res: Response;
  if (input.body.length <= MULTIPART_LIMIT) {
    const boundary = `opendocs-${id}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\ncontent-type: ${input.mimeType}\r\n\r\n`,
      ),
      input.body,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    res = await driveFetch(accessToken, `${UPLOAD_API}/files?uploadType=multipart&${query}`, {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    });
  } else {
    const start = await driveFetch(accessToken, `${UPLOAD_API}/files?uploadType=resumable&${query}`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": input.mimeType,
        "x-upload-content-length": String(input.body.length),
      },
      body: JSON.stringify(metadata),
    });
    const sessionUrl = start.headers.get("location");
    if (!start.ok || !sessionUrl) {
      throw new DriveApiError(`Couldn't start the upload (${start.status})`, start.status);
    }
    res = await driveFetch(accessToken, sessionUrl, {
      method: "PUT",
      headers: { "content-type": input.mimeType },
      body: new Uint8Array(input.body),
    });
  }

  if (res.status === 409) {
    // Already uploaded by an earlier attempt with this ID.
    return getDriveFile(accessToken, id);
  }
  const file = (await res.json().catch(() => ({}))) as Record<string, string> & {
    error?: { message?: string; errors?: Array<{ reason?: string }> };
  };
  if (!res.ok) {
    throw new DriveApiError(file.error?.message ?? `Upload failed (${res.status})`, res.status, file.error?.errors?.[0]?.reason);
  }
  return shapeFile(file);
}

export async function getDriveFile(accessToken: string, fileId: string): Promise<UploadedDriveFile> {
  const file = await driveJson<Record<string, string>>(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=${FILE_FIELDS}`,
  );
  return shapeFile(file);
}

function shapeFile(file: Record<string, string>): UploadedDriveFile {
  return {
    id: file.id,
    name: file.name,
    url: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
    sha256Checksum: file.sha256Checksum ?? null,
    md5Checksum: file.md5Checksum ?? null,
    headRevisionId: file.headRevisionId ?? null,
    createdTime: file.createdTime ?? null,
    size: Number(file.size ?? 0),
  };
}

/**
 * Mark a file read-only in Drive, with a reason. Google is clear this is a
 * signal, not an access control: real retention comes from Vault rules on
 * the shared drive. Best effort.
 */
export async function lockDriveFile(accessToken: string, fileId: string, reason: string): Promise<boolean> {
  try {
    await driveJson(
      accessToken,
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentRestrictions: [{ readOnly: true, reason }] }),
      },
    );
    return true;
  } catch {
    return false;
  }
}
