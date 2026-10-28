import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import {
  customDomainBridgeCodes,
  customDomainSessions,
  session,
  user,
  workspaceCustomDomains,
  workspaceMembers,
} from "../db/schema";
import { lookupCustomHost } from "./service";
import { safeReturnPath } from "./urls";

/**
 * Sign-in on custom domains (phase 2). The opendocs.cc session cookie never
 * reaches notes.example.com, so a reader who opens a private document
 * there goes through a short redirect:
 *
 *   1. notes.example.com/_opendocs/session?return=/plan sets a random
 *      `state` in a host-only cookie and redirects to
 *      opendocs.cc/auth/bridge?host=notes.example.com&return=/plan&state=…
 *   2. opendocs.cc signs the reader in if needed, checks the host is an
 *      active custom domain, and mints a one-time code (createBridgeCode)
 *      bound to the user, the host, the state and the return path.
 *   3. notes.example.com/_opendocs/session?code=…&state=… checks the state
 *      against its cookie and exchanges the code (exchangeBridgeCode) for a
 *      viewer session: a host-only cookie on the custom domain.
 *
 * Codes and session tokens are 32 random bytes; only their SHA-256 hashes
 * are stored. Viewer sessions can read and comment, nothing more.
 */

export const BRIDGE_CODE_TTL_MS = 60 * 1000;
export const VIEWER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Cookies on the custom domain: the viewer session token and the bridge
 * `state`. Over HTTPS they carry the `__Host-` prefix, which browsers only
 * accept without a Domain attribute, Secure and on Path=/: another host
 * under the same registrable domain (blog.example.com next to
 * notes.example.com) can't plant or overwrite them. Plain-HTTP test
 * domains (notes.localhost) use the bare names.
 */
export function viewerSessionCookieName(secure: boolean) {
  return secure ? "__Host-opendocs_viewer" : "opendocs_viewer";
}

export function bridgeStateCookieName(secure: boolean) {
  return secure ? "__Host-opendocs_bridge_state" : "opendocs_bridge_state";
}

/**
 * Set on the custom domain after a quiet sign-in check found nobody
 * signed in (or nobody who can read anything there): private pages then
 * show "sign in" instead of sending the reader to opendocs.cc again.
 */
export function signInCheckedCookieName(secure: boolean) {
  return secure ? "__Host-opendocs_signin_checked" : "opendocs_signin_checked";
}

export const SIGN_IN_CHECK_TTL_SECONDS = 30 * 60;

export const BRIDGE_STATE_TTL_SECONDS = 10 * 60;

export function hashBridgeSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function newBridgeSecret() {
  return randomBytes(32).toString("base64url");
}

/** `state` values are ours (newBridgeSecret), so anything else is refused. */
export function isValidBridgeState(state: unknown): state is string {
  return typeof state === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(state);
}

function isValidSecret(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(value);
}

export type BridgeCodeResult =
  | { error: "not_connected" | "invalid_state" | "invalid_return" }
  | { code: string; hostname: string; origin: string; expiresAt: Date };

/**
 * Step 2, on opendocs.cc: the signed-in user asked to be sent back to a
 * custom domain. Refuses hosts that aren't active, serving custom domains
 * (no open redirects) and return paths that aren't relative paths.
 */
export async function createBridgeCode(input: {
  userId: string;
  sessionId: string;
  hostname: string;
  state: unknown;
  returnPath: unknown;
}): Promise<BridgeCodeResult> {
  if (!isValidBridgeState(input.state)) return { error: "invalid_state" };
  const returnPath = safeReturnPath(typeof input.returnPath === "string" ? input.returnPath : "/");
  if (!returnPath) return { error: "invalid_return" };
  const site = await lookupCustomHost(input.hostname, { fresh: true });
  if (!site?.serving) return { error: "not_connected" };

  const code = newBridgeSecret();
  const expiresAt = new Date(Date.now() + BRIDGE_CODE_TTL_MS);
  await getDbOrThrow().insert(customDomainBridgeCodes).values({
    codeHash: hashBridgeSecret(code),
    stateHash: hashBridgeSecret(input.state),
    domainId: site.domainId,
    hostname: site.hostname,
    userId: input.userId,
    sourceSessionId: input.sessionId,
    returnPath,
    expiresAt,
  });
  return { code, hostname: site.hostname, origin: site.origin, expiresAt };
}

/**
 * Whether the user is an active member of the workspace that owns a
 * domain. Members go straight through the bridge; anyone else confirms
 * first (app/auth/bridge). A domain's owner controls its DNS, so they could
 * send the reader's browser, and with it the one-time code, to their own
 * server and learn who the reader is: a silent hand-off would tell any
 * workspace the name and email of every signed-in OpenDocs user who opens
 * a link to it.
 */
export async function isActiveWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
  const [row] = await getDbOrThrow()
    .select({ id: workspaceMembers.id })
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

export type BridgeExchangeResult =
  | { error: "invalid_code" | "not_connected" | "session_ended" }
  | { token: string; expiresAt: Date; returnPath: string; userId: string };

/**
 * Step 3, on the custom domain: trade a one-time code for a viewer
 * session. The code must be unused, unexpired, minted for this host and
 * this state, and the opendocs.cc session it came from must still exist.
 * Marking it used is a single conditional UPDATE, so two requests racing
 * with the same code can't both win.
 */
export async function exchangeBridgeCode(input: {
  code: unknown;
  state: unknown;
  hostname: string;
}): Promise<BridgeExchangeResult> {
  if (!isValidSecret(input.code) || !isValidBridgeState(input.state)) return { error: "invalid_code" };
  const database = getDbOrThrow();
  const now = new Date();
  const [claimed] = await database
    .update(customDomainBridgeCodes)
    .set({ consumedAt: now })
    .where(
      and(
        eq(customDomainBridgeCodes.codeHash, hashBridgeSecret(input.code)),
        eq(customDomainBridgeCodes.stateHash, hashBridgeSecret(input.state)),
        eq(customDomainBridgeCodes.hostname, input.hostname),
        isNull(customDomainBridgeCodes.consumedAt),
        gt(customDomainBridgeCodes.expiresAt, now),
      ),
    )
    .returning();
  if (!claimed) return { error: "invalid_code" };

  const site = await lookupCustomHost(input.hostname, { fresh: true });
  if (!site?.serving || site.domainId !== claimed.domainId) return { error: "not_connected" };

  const [source] = await database
    .select({ expiresAt: session.expiresAt })
    .from(session)
    .where(and(eq(session.id, claimed.sourceSessionId), gt(session.expiresAt, now)))
    .limit(1);
  if (!source) return { error: "session_ended" };

  const token = newBridgeSecret();
  const expiresAt = new Date(now.getTime() + VIEWER_SESSION_TTL_MS);
  await database.insert(customDomainSessions).values({
    tokenHash: hashBridgeSecret(token),
    domainId: claimed.domainId,
    hostname: claimed.hostname,
    userId: claimed.userId,
    sourceSessionId: claimed.sourceSessionId,
    expiresAt,
  });
  return { token, expiresAt, returnPath: claimed.returnPath, userId: claimed.userId };
}

export type ViewerSession = {
  id: string;
  hostname: string;
  expiresAt: Date;
  user: { id: string; name: string; email: string; image: string | null };
};

/**
 * The viewer behind a custom-domain cookie, or null. Valid only on the host
 * it was made for, before it expires, and while the opendocs.cc session it
 * came from is still alive (signing out there ends it).
 */
export async function getViewerSession(token: unknown, hostname: string): Promise<ViewerSession | null> {
  if (!isValidSecret(token)) return null;
  const now = new Date();
  const [row] = await getDbOrThrow()
    .select({
      id: customDomainSessions.id,
      hostname: customDomainSessions.hostname,
      expiresAt: customDomainSessions.expiresAt,
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(customDomainSessions)
    .innerJoin(session, eq(session.id, customDomainSessions.sourceSessionId))
    .innerJoin(user, eq(user.id, customDomainSessions.userId))
    // The domain the session was made for must still be the active one for
    // this host: if the name later goes to another workspace (its old row
    // misconfigured, a new owner verifies it), old sign-ins don't carry over.
    .innerJoin(
      workspaceCustomDomains,
      and(
        eq(workspaceCustomDomains.id, customDomainSessions.domainId),
        eq(workspaceCustomDomains.status, "active"),
      ),
    )
    .where(
      and(
        eq(customDomainSessions.tokenHash, hashBridgeSecret(token)),
        eq(customDomainSessions.hostname, hostname),
        gt(customDomainSessions.expiresAt, now),
        gt(session.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    hostname: row.hostname,
    expiresAt: row.expiresAt,
    user: { id: row.userId, name: row.name, email: row.email, image: row.image ?? null },
  };
}

/** Sign out of one custom domain. */
export async function revokeViewerSession(token: unknown) {
  if (!isValidSecret(token)) return;
  await getDbOrThrow()
    .delete(customDomainSessions)
    .where(eq(customDomainSessions.tokenHash, hashBridgeSecret(token)));
}

/**
 * "Sign out" on a custom domain: ends the opendocs.cc session the viewer
 * session came from, which (ON DELETE cascade) also ends its sign-ins on
 * every custom domain. Signing out of the domain alone wasn't enough: the
 * next private page sent a member through the bridge and, still signed in
 * on opendocs.cc, straight back in. Returns whether a session was found.
 */
export async function signOutEverywhere(token: unknown): Promise<boolean> {
  if (!isValidSecret(token)) return false;
  const database = getDbOrThrow();
  const [viewer] = await database
    .select({ sourceSessionId: customDomainSessions.sourceSessionId })
    .from(customDomainSessions)
    .where(eq(customDomainSessions.tokenHash, hashBridgeSecret(token)))
    .limit(1);
  if (!viewer) return false;
  await database.delete(session).where(eq(session.id, viewer.sourceSessionId));
  return true;
}

/** Clean-up for the background job: expired codes (used or not) and sessions. */
export async function deleteExpiredBridgeRecords(now = new Date()) {
  const database = getDbOrThrow();
  await database.delete(customDomainBridgeCodes).where(lt(customDomainBridgeCodes.expiresAt, now));
  await database.delete(customDomainSessions).where(lt(customDomainSessions.expiresAt, now));
}
