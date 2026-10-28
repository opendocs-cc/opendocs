import "server-only";

import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";

import { signedOAuthQuery } from "./oauth-flow";

type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * The signed OAuth query on a page, only when its signature checks out and
 * it hasn't expired. Pages act on it (naming the connecting app, creating
 * an account's workspace) only after this.
 */
export async function verifiedOAuthQuery(params: RawSearchParams): Promise<string | null> {
  const query = signedOAuthQuery(params);
  if (!query) return null;
  const exp = Number(new URLSearchParams(query).get("exp"));
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const { auth } = await import("@/lib/auth");
  const { secret } = await auth.$context;
  return (await verifyOAuthQueryParams(query, secret).catch(() => false)) ? query : null;
}
