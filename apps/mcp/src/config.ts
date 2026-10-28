/**
 * Runtime settings for the MCP service. Production values are set in
 * deploy/docker-compose.yml; apps/mcp/.env holds local development ones.
 */
function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export const config = {
  port: Number(process.env.PORT ?? 4100),
  /** Canonical MCP resource: the URL people paste into Claude, ChatGPT, … */
  resourceUrl: trimSlash(process.env.MCP_RESOURCE_URL ?? "https://mcp.opendocs.cc/mcp"),
  /** The REST API over the private network (no Caddy hop). */
  apiUrl: trimSlash(process.env.API_INTERNAL_URL ?? "http://api:4000"),
  /** Public web origin, for links shown to people. */
  webUrl: trimSlash(process.env.PUBLIC_WEB_URL ?? "https://opendocs.cc"),
  /** Better Auth issuer: the web app's /api/auth. */
  issuer: trimSlash(process.env.OAUTH_ISSUER ?? "https://opendocs.cc/api/auth"),
  jwksUrl: process.env.OAUTH_JWKS_URL ?? null,
  /** Host headers accepted: MCP_ALLOWED_HOSTS, or the resource URL's host. */
  allowedHosts: (process.env.MCP_ALLOWED_HOSTS ?? new URL(process.env.MCP_RESOURCE_URL ?? "https://mcp.opendocs.cc/mcp").hostname)
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean),
  version: process.env.MCP_SERVER_VERSION ?? "1.0.0",
  /** A self-hosted instance (SELF_HOSTED=true): no opendocs.cc website. */
  selfHosted: process.env.SELF_HOSTED === "true",
  /**
   * The token OpenAI's plugin portal asks us to serve at
   * /.well-known/openai-apps-challenge to prove we own this host.
   */
  openaiAppsChallenge: process.env.OPENAI_APPS_CHALLENGE?.trim() || null,
};

export const ALL_SCOPES = ["docs:read", "docs:write", "integrations", "workspace:admin"] as const;
export type Scope = (typeof ALL_SCOPES)[number];

/**
 * Scopes a client is told to ask for (401 challenge and protected resource
 * metadata). offline_access is listed although the MCP spec advises
 * against it: refresh tokens are only issued with it, Claude adds it on
 * its own, but ChatGPT asks for exactly what we list, so without it
 * ChatGPT had to reconnect every hour when its access token expired.
 */
export const REQUESTED_SCOPES = [...ALL_SCOPES, "offline_access"] as const;

export function resourceMetadataUrl(): string {
  const url = new URL(config.resourceUrl);
  return `${url.origin}/.well-known/oauth-protected-resource${url.pathname === "/" ? "" : url.pathname}`;
}
