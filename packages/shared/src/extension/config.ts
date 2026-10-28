/**
 * The OpenDocs browser extension (opendocs-cc/opendocs-extension). Its
 * extension IDs decide two things on our side:
 *
 *   - its OAuth redirect URLs (`https://<id>.chromiumapp.org/`), listed in
 *     the Client ID Metadata Document it signs in with
 *     (apps/web/app/oauth/clients/browser-extension.json);
 *   - the origins (`chrome-extension://<id>`) the API and the token
 *     endpoint answer with CORS. The extension calls them from its service
 *     worker without host permissions, so the install warning names only
 *     the three chat sites.
 *
 * Every store gives the extension its own ID. EXTENSION_IDS (comma-separated)
 * lists them without a code change, e.g. a new store listing; production
 * sets it to the store IDs. The development ID is trusted only outside
 * production (NODE_ENV !== "production"): its key is in the extension's
 * source, not a secret, so any unpacked build can claim that ID.
 */

export const DEVELOPMENT_EXTENSION_IDS = [
  // Development builds (the `key` in the extension's manifest).
  "pmpocloilkjljlpelbkngppeaagmaccc",
] as const;

const EXTENSION_ID = /^[a-p]{32}$/;

export function extensionIds(): string[] {
  const configured = (process.env.EXTENSION_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => EXTENSION_ID.test(id));
  const development = process.env.NODE_ENV === "production" ? [] : DEVELOPMENT_EXTENSION_IDS;
  return [...new Set([...development, ...configured])];
}

export function extensionOrigins(): string[] {
  return extensionIds().map((id) => `chrome-extension://${id}`);
}

export function isExtensionOrigin(origin: string | null | undefined): boolean {
  return !!origin && extensionOrigins().includes(origin);
}

export function extensionRedirectUris(): string[] {
  return extensionIds().map((id) => `https://${id}.chromiumapp.org/`);
}

/** Path of the extension's Client ID Metadata Document on the web app. */
export const EXTENSION_CLIENT_METADATA_PATH = "/oauth/clients/browser-extension.json";

/** What the extension asks for when it signs in. */
export const EXTENSION_SCOPES = ["docs:read", "docs:write", "offline_access"] as const;

/** Chat sites the extension publishes from (`X-OpenDocs-Client: opendocs-extension/<site>`). */
export const EXTENSION_SITES = ["chatgpt", "claude", "gemini"] as const;
export type ExtensionSite = (typeof EXTENSION_SITES)[number];
