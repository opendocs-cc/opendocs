import { NextResponse, type NextRequest } from "next/server";

import { viewerSessionCookieName } from "@opendocs/shared/custom-domains/bridge";

import { API_BASE_URL } from "@/lib/config/api";
import { getSiteContext } from "@/lib/site-context";
import { isCustomSite } from "@/lib/site-paths";

export const dynamic = "force-dynamic";

// The API's public download endpoints (under /api/v1/public) a reader page
// calls: a document's Markdown, PDF and Word file, and the workspace zip.
const DOWNLOADS: Array<{ pattern: RegExp; method: "GET" | "POST" }> = [
  { pattern: /^posts\/([^/]+)\/(?:projects\/[^/]+\/)?[^/]+\/raw$/, method: "GET" },
  { pattern: /^posts\/([^/]+)\/(?:projects\/[^/]+\/)?[^/]+\/export\/(?:pdf|docx)$/, method: "POST" },
  { pattern: /^workspaces\/([^/]+)\/markdown\.zip$/, method: "GET" },
];

const PASSED_HEADERS = ["content-type", "content-disposition", "content-length", "x-cache"];

/** The API as this server reaches it: the Compose network in production. */
function internalApiUrl() {
  return (process.env.INTERNAL_API_URL || process.env.API_URL || API_BASE_URL).replace(/\/+$/, "");
}

/**
 * /_opendocs/download/... on a custom domain: the article page's
 * downloads, same-origin. A reader signed in on the domain has a host-only
 * viewer session the browser can't send to the API, so this route passes
 * it along (apps/api/src/middleware/custom-domain-viewer.ts checks it and
 * limits it to this domain's workspace), together with the reader's
 * address for the API's rate limits. Readers who aren't signed in get
 * public documents, as from the API directly.
 */
async function proxy(request: NextRequest, path: string[], method: "GET" | "POST") {
  const site = await getSiteContext();
  if (!isCustomSite(site)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const joined = path.map((segment) => encodeURIComponent(segment)).join("/");
  const route = DOWNLOADS.find((download) => download.method === method && download.pattern.test(joined));
  const workspaceSlug = route ? decodeURIComponent(joined.match(route.pattern)?.[1] ?? "") : "";
  if (!route || workspaceSlug.toLowerCase() !== site.workspaceSlug) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const headers = new Headers({ "x-opendocs-viewer-host": site.hostname });
  const token = request.cookies.get(viewerSessionCookieName(site.origin.startsWith("https://")))?.value;
  if (token) headers.set("x-opendocs-viewer-session", token);
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (clientIp) headers.set("x-forwarded-for", clientIp);
  if (method === "POST") headers.set("content-type", "application/json");

  const upstream = await fetch(`${internalApiUrl()}/api/v1/public/${joined}`, {
    method,
    headers,
    body: method === "POST" ? "{}" : undefined,
    cache: "no-store",
    redirect: "manual",
  });
  const responseHeaders = new Headers({ "cache-control": "no-store" });
  for (const name of PASSED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path, "GET");
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, (await context.params).path, "POST");
}
