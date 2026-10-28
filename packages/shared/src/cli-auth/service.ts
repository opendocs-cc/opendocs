import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";

import { generateApiKey, hashApiKey } from "../api-keys/service";
import { getDbOrThrow } from "../db/guards";
import { apiKeys, auditEvents, cliLoginRequests } from "../db/schema";
import { getWorkspaceSettings } from "../workspaces/service";

const REQUEST_TTL_MS = 10 * 60 * 1000;
const CODE_BYTES = 32;

export class CliAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "CliAuthError";
  }
}

function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertLocalRedirectUri(redirectUri: string) {
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new CliAuthError("invalid_redirect_uri", "The CLI redirect URI is invalid.");
  }

  const isLoopback =
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "::1" ||
    parsed.hostname === "localhost";
  const isHttp = parsed.protocol === "http:";
  const isCallback = parsed.pathname === "/callback";

  if (!isLoopback || !isHttp || !isCallback) {
    throw new CliAuthError(
      "invalid_redirect_uri",
      "CLI browser login only supports http://127.0.0.1:<port>/callback redirect URIs.",
    );
  }
}

export async function createCliLoginRequest(input: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
  apiUrl: string;
  clientName?: string | null;
}) {
  assertLocalRedirectUri(input.redirectUri);

  if (input.state.length < 32 || input.codeChallenge.length < 32) {
    throw new CliAuthError("invalid_request", "CLI login request is missing security parameters.");
  }

  const database = getDbOrThrow();
  const expiresAt = new Date(Date.now() + REQUEST_TTL_MS);
  const [record] = await database
    .insert(cliLoginRequests)
    .values({
      stateHash: sha256Hex(input.state),
      codeChallenge: input.codeChallenge,
      redirectUri: input.redirectUri,
      apiUrl: input.apiUrl,
      clientName: input.clientName?.slice(0, 100) ?? null,
      expiresAt,
    })
    .returning({
      id: cliLoginRequests.id,
      expiresAt: cliLoginRequests.expiresAt,
    });

  return record;
}

export async function getCliLoginRequestForApproval(id: string, state: string) {
  const database = getDbOrThrow();
  const [request] = await database
    .select({
      id: cliLoginRequests.id,
      redirectUri: cliLoginRequests.redirectUri,
      apiUrl: cliLoginRequests.apiUrl,
      clientName: cliLoginRequests.clientName,
      approvedAt: cliLoginRequests.approvedAt,
      consumedAt: cliLoginRequests.consumedAt,
      expiresAt: cliLoginRequests.expiresAt,
    })
    .from(cliLoginRequests)
    .where(
      and(
        eq(cliLoginRequests.id, id),
        eq(cliLoginRequests.stateHash, sha256Hex(state)),
        gt(cliLoginRequests.expiresAt, new Date()),
        isNull(cliLoginRequests.consumedAt),
      ),
    )
    .limit(1);

  return request ?? null;
}

export async function approveCliLoginRequest(input: {
  id: string;
  state: string;
  userId: string;
  workspaceId: string;
}) {
  const workspace = await getWorkspaceSettings(input.userId, input.workspaceId);
  if (!workspace) {
    throw new CliAuthError("forbidden", "You do not have access to that workspace.");
  }

  const request = await getCliLoginRequestForApproval(input.id, input.state);
  if (!request) {
    throw new CliAuthError("expired_request", "This CLI login request expired. Run login again.");
  }

  const code = randomBytes(CODE_BYTES).toString("base64url");
  const codeHash = sha256Hex(code);
  const database = getDbOrThrow();

  await database
    .update(cliLoginRequests)
    .set({
      userId: input.userId,
      workspaceId: input.workspaceId,
      authCodeHash: codeHash,
      approvedAt: new Date(),
    })
    .where(eq(cliLoginRequests.id, input.id));

  const redirect = new URL(request.redirectUri);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("state", input.state);

  return { redirectUri: redirect.toString() };
}

export async function exchangeCliLoginCode(input: {
  code: string;
  codeVerifier: string;
}) {
  const database = getDbOrThrow();
  const expectedChallenge = sha256Base64Url(input.codeVerifier);
  const codeHash = sha256Hex(input.code);

  const [request] = await database
    .select({
      id: cliLoginRequests.id,
      userId: cliLoginRequests.userId,
      workspaceId: cliLoginRequests.workspaceId,
      codeChallenge: cliLoginRequests.codeChallenge,
      apiUrl: cliLoginRequests.apiUrl,
      clientName: cliLoginRequests.clientName,
    })
    .from(cliLoginRequests)
    .where(
      and(
        eq(cliLoginRequests.authCodeHash, codeHash),
        gt(cliLoginRequests.expiresAt, new Date()),
        isNull(cliLoginRequests.consumedAt),
      ),
    )
    .limit(1);

  if (!request?.userId || !request.workspaceId) {
    throw new CliAuthError("invalid_code", "The CLI login code is invalid or expired.");
  }

  if (request.codeChallenge !== expectedChallenge) {
    throw new CliAuthError("invalid_code_verifier", "The CLI login verifier did not match.");
  }

  const userId = request.userId;
  const workspaceId = request.workspaceId;
  const plaintext = generateApiKey();
  const hashed = hashApiKey(plaintext);
  const hint = plaintext.slice(-4);
  const label = request.clientName || "OpenDocs CLI";

  await database.transaction(async (tx) => {
    const [consumed] = await tx
      .update(cliLoginRequests)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(cliLoginRequests.id, request.id),
          isNull(cliLoginRequests.consumedAt),
        ),
      )
      .returning({ id: cliLoginRequests.id });

    if (!consumed) {
      throw new CliAuthError("invalid_code", "The CLI login code was already used.");
    }

    const [record] = await tx
      .insert(apiKeys)
      .values({
        userId,
        workspaceId,
        label,
        hashedKey: hashed,
        keyHint: hint,
      })
      .returning({ id: apiKeys.id });

    await tx.insert(auditEvents).values({
      actorUserId: userId,
      workspaceId,
      eventType: "api_key_created",
      metadata: { apiKeyId: record.id, label, source: "cli_browser_login" },
    });
  });

  return {
    apiKey: plaintext,
    apiUrl: request.apiUrl,
  };
}
