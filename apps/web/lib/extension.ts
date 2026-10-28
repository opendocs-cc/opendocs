/**
 * The OpenDocs browser extension (opendocs-cc/opendocs-extension): its store
 * listings and pages. One source for /extension, the footer and the docs.
 *
 * The store links come from the environment (read at request time by server
 * components) so they can be set once a store approves the listing; until
 * then the page says it's on its way.
 */

export const EXTENSION_NAME = "OpenDocs: Publish ChatGPT, Claude & Gemini chats as PDF & links";
export const EXTENSION_PAGE_PATH = "/extension";
export const EXTENSION_PAGE_URL = "https://opendocs.cc/extension";
export const EXTENSION_DOCS_URL = "https://docs.opendocs.cc/integrations/browser-extension";
export const EXTENSION_SOURCE_URL = "https://github.com/opendocs-cc/opendocs-extension";

export function extensionStoreLinks(): { chrome: string | null; edge: string | null } {
  return {
    chrome: process.env.EXTENSION_CHROME_URL?.trim() || null,
    edge: process.env.EXTENSION_EDGE_URL?.trim() || null,
  };
}

/** The chat sites the extension works on, in the order the page lists them. */
export const EXTENSION_SITES = ["ChatGPT", "Claude", "Gemini"] as const;
