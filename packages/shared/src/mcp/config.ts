/**
 * Shared settings for the OpenDocs MCP server (apps/mcp) and the OAuth
 * authorization server that protects it (Better Auth on opendocs.cc).
 * The web app issues tokens, the API accepts them as `authMethod: "oauth"`,
 * and the MCP service forwards them to the API.
 */

export const DEFAULT_MCP_RESOURCE_URL = "https://mcp.opendocs.cc/mcp";

/**
 * The canonical MCP resource (RFC 8707 / RFC 9728). Access tokens are
 * audience-bound to it. Override with MCP_RESOURCE_URL in development
 * (http is only accepted on loopback hosts).
 */
export function mcpResourceUrl(): string {
  return (process.env.MCP_RESOURCE_URL ?? DEFAULT_MCP_RESOURCE_URL).replace(/\/+$/, "");
}

/**
 * Better Auth's base URL on opendocs.cc. The issuer of MCP access tokens is
 * this origin plus the auth base path (`/api/auth`).
 */
export function oauthIssuer(): string {
  const base = (process.env.OAUTH_ISSUER_BASE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/api/auth`;
}

export type McpScope = "docs:read" | "docs:write" | "integrations" | "workspace:admin";

export const MCP_SCOPE_DETAILS: Record<
  McpScope,
  { label: string; description: string; required?: boolean }
> = {
  "docs:read": {
    label: "Read your documents and projects",
    description: "List, open and export documents, and see who has access.",
    required: true,
  },
  "docs:write": {
    label: "Create, update, share and export documents",
    description: "Publish new documents, edit them, change who can see them and organise projects.",
  },
  integrations: {
    label: "Google Drive and e-signatures",
    description: "Save documents to your Drive folders and send them for signature.",
  },
  "workspace:admin": {
    label: "Manage team members, workspaces and export branding",
    description: "Invite or remove people, change roles and the PDF/Word theme.",
  },
};

export const MCP_SCOPES = Object.keys(MCP_SCOPE_DETAILS) as McpScope[];

/** Scopes the authorization server knows about, including refresh tokens. */
export const OAUTH_SERVER_SCOPES = [...MCP_SCOPES, "offline_access"] as const;

export function parseScopes(raw: unknown): Set<string> {
  if (Array.isArray(raw)) return new Set(raw.map(String));
  if (typeof raw === "string") return new Set(raw.split(/\s+/).filter(Boolean));
  return new Set();
}
