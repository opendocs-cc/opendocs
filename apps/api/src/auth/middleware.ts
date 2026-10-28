import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { eq, and, isNull } from "drizzle-orm";

import { getDbOrThrow } from "@opendocs/shared/db/guards";
import { apiKeys } from "@opendocs/shared/db/schema";
import { hashApiKey } from "@opendocs/shared/api-keys/service";

import { auth } from "./index";
import {
  bearerToken,
  looksLikeOAuthToken,
  requiredScopeFor,
  verifyOAuthAccessToken,
} from "./oauth-token";
import type { AuthenticatedRequest } from "../types";

/**
 * Tries the request's bearer token as an OAuth access token (MCP clients).
 * "none": not an OAuth token; "invalid": one that failed verification or
 * was revoked; "forbidden": valid but missing the scope this route needs
 * (the response has been sent).
 */
async function tryOAuthAuth(
  req: Request,
  res: Response,
): Promise<"ok" | "none" | "invalid" | "forbidden"> {
  const token = bearerToken(req);
  if (!token || !looksLikeOAuthToken(token)) return "none";
  const verified = await verifyOAuthAccessToken(token);
  if (!verified) return "invalid";
  const scope = requiredScopeFor(req);
  if (!verified.grant.scopes.has(scope)) {
    res.status(403).json({
      error: "insufficient_scope",
      scope,
      message: `This connection doesn't have the "${scope}" permission. Reconnect the app and allow it on the OpenDocs consent screen.`,
    });
    return "forbidden";
  }
  const authed = req as AuthenticatedRequest;
  authed.userId = verified.userId;
  authed.authMethod = "oauth";
  authed.oauth = verified.grant;
  return "ok";
}

export async function requireSessionAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    (req as AuthenticatedRequest).userId = session.user.id;
    (req as AuthenticatedRequest).authMethod = "session";
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}

export async function requireApiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer od_live_")) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer "
  const hashed = hashApiKey(token);
  const database = getDbOrThrow();

  const [key] = await database
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
    })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.hashedKey, hashed),
        isNull(apiKeys.revokedAt),
      ),
    )
    .limit(1);

  if (!key) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  // Update lastUsedAt (fire-and-forget)
  database
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id))
    .catch(() => {});

  (req as AuthenticatedRequest).userId = key.userId;
  (req as AuthenticatedRequest).authMethod = "api_key";
  next();
}

/**
 * Populates `req.userId` + `req.authMethod` when the caller is
 * authenticated (session cookie or `Bearer od_live_` API key), but
 * does NOT 401 when they aren't. Use this on endpoints that need to
 * behave differently for anonymous vs. signed-in viewers — e.g. the
 * public-download route, which lets the author download their own
 * private drafts while restricting outsiders to public posts.
 *
 * On any auth failure (including a malformed API key) the request
 * continues with `userId` unset — the handler is responsible for
 * making a best-effort decision based on whatever it's got.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (session) {
      (req as AuthenticatedRequest).userId = session.user.id;
      (req as AuthenticatedRequest).authMethod = "session";
      next();
      return;
    }
  } catch {
    // Session check failed — fall through to API-key check.
  }

  const oauth = await tryOAuthAuth(req, _res);
  if (oauth === "forbidden") return;
  if (oauth === "ok") {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer od_live_")) {
    const token = authHeader.slice(7);
    const hashed = hashApiKey(token);
    const database = getDbOrThrow();
    const [key] = await database
      .select({ id: apiKeys.id, userId: apiKeys.userId })
      .from(apiKeys)
      .where(and(eq(apiKeys.hashedKey, hashed), isNull(apiKeys.revokedAt)))
      .limit(1);
    if (key) {
      database
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, key.id))
        .catch(() => {});
      (req as AuthenticatedRequest).userId = key.userId;
      (req as AuthenticatedRequest).authMethod = "api_key";
    }
  }

  // Anonymous — userId stays unset; the handler decides what to do.
  next();
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Try session first
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (session) {
      (req as AuthenticatedRequest).userId = session.user.id;
      (req as AuthenticatedRequest).authMethod = "session";
      next();
      return;
    }
  } catch {
    // Session check failed, try API key
  }

  // OAuth access token from an MCP client
  const oauth = await tryOAuthAuth(req, res);
  if (oauth === "forbidden") return;
  if (oauth === "ok") {
    next();
    return;
  }
  if (oauth === "invalid") {
    res.status(401).json({
      error: "invalid_token",
      message: "The access token is invalid, expired or was disconnected. Reconnect the app to OpenDocs.",
    });
    return;
  }

  // Try API key
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer od_live_")) {
    const token = authHeader.slice(7);
    const hashed = hashApiKey(token);
    const database = getDbOrThrow();

    const [key] = await database
      .select({
        id: apiKeys.id,
        userId: apiKeys.userId,
      })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.hashedKey, hashed),
          isNull(apiKeys.revokedAt),
        ),
      )
      .limit(1);

    if (key) {
      database
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, key.id))
        .catch(() => {});

      (req as AuthenticatedRequest).userId = key.userId;
      (req as AuthenticatedRequest).authMethod = "api_key";
      next();
      return;
    }
  }

  res.status(401).json({ error: "unauthorized" });
}
