import type { Request } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { mcpResourceUrl, oauthIssuer, parseScopes, type McpScope } from "@opendocs/shared/mcp/config";
import { checkConnectionToken, type McpConnection } from "@opendocs/shared/mcp/connections";

/**
 * OAuth access tokens issued by opendocs.cc (Better Auth's MCP plugin) for
 * the MCP server. The MCP service forwards them with every API call; the
 * API accepts them only when they were issued for the MCP resource
 * (audience), by our issuer, unexpired, and not revoked in Dashboard →
 * Connected apps.
 */

export type OAuthGrant = {
  clientId: string;
  scopes: Set<string>;
  connection: McpConnection | null;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    const url = process.env.OAUTH_JWKS_URL ?? `${oauthIssuer()}/jwks`;
    jwks = createRemoteJWKSet(new URL(url), { cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 });
  }
  return jwks;
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/** JWT-shaped bearer tokens are OAuth access tokens; od_live_ ones are API keys. */
export function looksLikeOAuthToken(token: string): boolean {
  return !token.startsWith("od_live_") && token.split(".").length === 3;
}

export async function verifyOAuthAccessToken(
  token: string,
): Promise<{ userId: string; grant: OAuthGrant } | null> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, getJwks(), {
      issuer: oauthIssuer(),
      audience: mcpResourceUrl(),
      typ: "at+jwt",
      requiredClaims: ["exp", "iat", "sub"],
    }));
  } catch {
    return null;
  }
  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const clientId =
    typeof payload.azp === "string"
      ? payload.azp
      : typeof payload.client_id === "string"
        ? payload.client_id
        : null;
  // A user's token: client-credentials tokens (subject = the client) aren't accepted.
  if (!userId || !clientId || userId === clientId || typeof payload.iat !== "number") return null;

  const check = await checkConnectionToken(userId, clientId, new Date(payload.iat * 1000));
  if (!check.ok) return null;
  return {
    userId,
    grant: { clientId, scopes: parseScopes(payload.scope), connection: check.connection },
  };
}

const INTEGRATION_PATHS = [
  /^\/integrations(\/|$)/,
  /^\/signature-requests(\/|$)/,
  /^\/posts\/[^/]+\/storage$/,
  /^\/posts\/[^/]+\/signature-requests$/,
];

// Writes that only produce something for the caller (an export, a download
// link, this connection's own defaults): reading is enough. Download links
// for signature PDFs additionally need "integrations" (checked in the route).
const READ_EQUIVALENT_WRITES = [
  /^\/download-links$/,
  /^\/mcp\/connection$/,
  /^\/posts\/[^/]+\/export\/[^/]+$/,
  /^\/posts\/batch\/export$/,
  /^\/public\/posts\/.+\/export\/[^/]+$/,
];

// The invitee's own side of team membership.
const MEMBER_WRITES = [/^\/workspace\/team\/accept-invite$/];

const ADMIN_WRITE_PATHS = [
  /^\/workspace\/team(\/|$)/,
  /^\/workspace\/auto-join$/,
  /^\/workspaces$/,
  /^\/workspace\/branding$/,
  /^\/workspace\/logo(\/upload)?$/,
  /^\/workspace\/domain(\/|$)/,
];

/**
 * The path a scope rule matches against: the route's declared pattern when
 * the auth middleware runs on a route (always, today), else the request
 * path. Lowercased with trailing slashes and the /api/v1 prefix removed,
 * because Express routing ignores case and trailing slashes and a rule must
 * never miss a route that would still be served.
 */
function scopePath(req: Request): string {
  const pattern = (req.route as { path?: unknown } | undefined)?.path;
  let path: string;
  if (typeof pattern === "string") {
    path = pattern;
  } else {
    path = `${req.baseUrl}${req.path}`;
    try {
      path = decodeURIComponent(path);
    } catch {
      // keep the raw path
    }
  }
  return (
    path
      .toLowerCase()
      .replace(/^\/api\/v1(?=\/|$)/, "")
      .replace(/\/+$/, "") || "/"
  );
}

/**
 * The scope an OAuth caller needs for an API request. Reads need
 * docs:read and writes docs:write; Google Drive and e-signature routes
 * need integrations; managing the team, workspaces and export branding
 * needs workspace:admin (reading team and branding stays docs:read).
 */
export function requiredScopeFor(req: Request): McpScope {
  const path = scopePath(req);
  const isRead = req.method === "GET" || req.method === "HEAD";
  if (INTEGRATION_PATHS.some((re) => re.test(path))) return "integrations";
  if (isRead) return "docs:read";
  if (READ_EQUIVALENT_WRITES.some((re) => re.test(path))) return "docs:read";
  if (MEMBER_WRITES.some((re) => re.test(path))) return "docs:write";
  if (ADMIN_WRITE_PATHS.some((re) => re.test(path))) return "workspace:admin";
  return "docs:write";
}
