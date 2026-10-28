/**
 * Helpers for pages that sit inside an OAuth authorization flow (MCP
 * clients such as Claude or ChatGPT connecting to OpenDocs). Better Auth's
 * OAuth provider redirects to /login and /oauth/consent with the original
 * authorize request plus a signature (`sig`, `exp`, `ba_*`). The sign-in
 * forms pass that signed query back (oauthProviderClient does it from
 * window.location.search), and the server resumes the authorization once
 * a session exists.
 */

const SIGNATURE_PARAMS = new Set(["sig", "exp", "ba_iat", "ba_pl", "ba_param"]);

type RawSearchParams = Record<string, string | string[] | undefined>;

/** The signed OAuth query on a login/signup/consent page, or null. */
export function signedOAuthQuery(params: RawSearchParams): string | null {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  if (!query.has("sig") || !query.has("client_id")) return null;
  return query.toString();
}

/**
 * The plain authorize URL for a signed query. Visiting it with a session
 * continues the flow (consent, or straight back to the client when consent
 * was given before); used as the fallback after sign-in.
 */
export function authorizeUrlFromSignedQuery(signedQuery: string): string {
  const original = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(signedQuery)) {
    if (!SIGNATURE_PARAMS.has(key)) original.append(key, value);
  }
  return `/api/auth/oauth2/authorize?${original.toString()}`;
}
