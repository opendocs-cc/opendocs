/**
 * This OpenDocs instance: opendocs.cc, or a self-hosted one. The one place
 * that knows its addresses and mode.
 *
 * Server code reads the settings at runtime (BETTER_AUTH_URL, API_URL,
 * MCP_RESOURCE_URL, SELF_HOSTED). Pages rendered in the browser get the
 * NEXT_PUBLIC_* copies the web image is built with (deploy/docker-compose.yml
 * derives them from the same settings). Unset, everything is opendocs.cc.
 */

export const OPENDOCS_CC = {
  web: "https://opendocs.cc",
  api: "https://api.opendocs.cc",
  mcp: "https://mcp.opendocs.cc/mcp",
} as const;

/** The documentation, which every instance links to. */
export const OFFICIAL_DOCS_URL = "https://docs.opendocs.cc";

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** The web app's origin, e.g. https://opendocs.cc. */
export function instanceWebUrl(): string {
  return trimSlash(
    process.env.NEXT_PUBLIC_WEB_URL ||
      process.env.WEB_APP_URL ||
      process.env.BETTER_AUTH_URL ||
      OPENDOCS_CC.web,
  );
}

/** The REST API's origin, e.g. https://api.opendocs.cc. */
export function instanceApiUrl(): string {
  return trimSlash(process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || OPENDOCS_CC.api);
}

/** The MCP server's URL, e.g. https://mcp.opendocs.cc/mcp. */
export function instanceMcpUrl(): string {
  return trimSlash(process.env.MCP_RESOURCE_URL || process.env.NEXT_PUBLIC_MCP_URL || OPENDOCS_CC.mcp);
}

/** The web app's host, for showing addresses like `opendocs.cc/acme`. */
export function instanceHost(): string {
  try {
    return new URL(instanceWebUrl()).host;
  } catch {
    return "opendocs.cc";
  }
}

/** True on opendocs.cc itself (and in development against it). */
export function isOpenDocsCc(): boolean {
  return instanceWebUrl() === OPENDOCS_CC.web;
}

/**
 * SELF_HOSTED=true: an instance for one team rather than the public
 * service. The marketing site, anonymous publishing and the free tools are
 * off, and without billing everyone gets every feature (see
 * billing/comped-tiers.ts).
 */
export function isSelfHosted(): boolean {
  return process.env.SELF_HOSTED === "true" || process.env.NEXT_PUBLIC_SELF_HOSTED === "true";
}

/**
 * Text that mentions opendocs.cc's addresses (agent files, the install
 * script, setup prompts), rewritten to this instance's. The docs stay on
 * docs.opendocs.cc. CLI sign-in commands get `--api-url`, which the CLI
 * remembers, so every later command talks to this instance. Unchanged on
 * opendocs.cc.
 */
export function withInstanceUrls(text: string): string {
  if (isOpenDocsCc()) return text;
  const web = instanceWebUrl();
  const api = instanceApiUrl();
  const mcp = instanceMcpUrl();
  return text
    .replaceAll(OPENDOCS_CC.mcp, mcp)
    .replaceAll("https://mcp.opendocs.cc", new URL(mcp).origin)
    .replaceAll(OPENDOCS_CC.api, api)
    .replaceAll("https://www.opendocs.cc", web)
    .replaceAll(OPENDOCS_CC.web, web)
    .replace(/(?<![\w./-])(opendocs|@opendocs\.cc\/cli) login\b(?! --api-url)/g, `$1 login --api-url ${api}`);
}
