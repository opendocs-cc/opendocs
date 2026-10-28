import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/server";

import { REQUESTED_SCOPES, config, resourceMetadataUrl } from "./config";

/**
 * Bearer-token guard for /mcp. Access tokens are JWTs issued by
 * opendocs.cc for this resource; anything else gets a 401 whose
 * WWW-Authenticate header points at our protected resource metadata, which
 * is how Claude, ChatGPT and other clients start the sign-in flow. The
 * challenge always lists every scope so the consent screen can offer all
 * of them (clients ask for what the challenge names).
 *
 * The API re-checks every token on each call (signature, audience and the
 * Connected apps revocation list), so revocation takes effect there.
 */

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  jwks ??= createRemoteJWKSet(new URL(config.jwksUrl ?? `${config.issuer}/jwks`), {
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
  });
  return jwks;
}

function challenge(res: Response, error?: { code: string; description: string }) {
  const parts = [
    `resource_metadata="${resourceMetadataUrl()}"`,
    `scope="${REQUESTED_SCOPES.join(" ")}"`,
  ];
  if (error) parts.unshift(`error="${error.code}"`, `error_description="${error.description}"`);
  res.setHeader("WWW-Authenticate", `Bearer ${parts.join(", ")}`);
  res.status(401).json(
    error
      ? { error: error.code, error_description: error.description }
      : { error: "unauthorized", error_description: "Sign in to OpenDocs to use this server." },
  );
}

export async function verifyAccessToken(token: string): Promise<AuthInfo | null> {
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: config.issuer,
      audience: config.resourceUrl,
      typ: "at+jwt",
      requiredClaims: ["exp", "iat", "sub"],
    });
    const clientId =
      typeof payload.azp === "string"
        ? payload.azp
        : typeof payload.client_id === "string"
          ? payload.client_id
          : null;
    if (!clientId || typeof payload.sub !== "string" || payload.sub === clientId || typeof payload.exp !== "number") {
      return null;
    }
    return {
      token,
      clientId,
      scopes: typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
      expiresAt: payload.exp,
      resource: new URL(config.resourceUrl),
      extra: { userId: payload.sub },
    };
  } catch {
    return null;
  }
}

export async function requireMcpToken(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    challenge(res);
    return;
  }
  const info = await verifyAccessToken(header.slice(7).trim());
  if (!info) {
    challenge(res, { code: "invalid_token", description: "The access token is invalid or expired." });
    return;
  }
  (req as Request & { auth?: AuthInfo }).auth = info;
  next();
}
