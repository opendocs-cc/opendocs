import { NextResponse, type NextRequest } from "next/server";

import { isOpenDocsCc, isSelfHosted } from "@opendocs/shared/config/instance";
import { isOpenDocsHost, normalizeHostHeader } from "@opendocs/shared/custom-domains/hostname";
import { lookupCustomHost } from "@opendocs/shared/custom-domains/service";
import {
  isCustomDomainAppPath,
  openDocsWebUrl,
  workspaceRoutePath,
} from "@opendocs/shared/custom-domains/urls";

import { INSTANCE_FILE_HEADER, INSTANCE_FILES, isPublicSitePath } from "@/lib/instance-files";
import { plainHtmlPage } from "@/lib/plain-page";
import { REDIRECT_HEADER, SITE_HEADER, serializeSiteContext } from "@/lib/site-paths";

/**
 * Custom domains. opendocs.cc and its own hosts pass straight through. Any
 * other host is looked up (cached for a minute, by workspace id, so slug
 * changes don't break a domain) and, when it's an active custom domain,
 * `/plan` is rewritten to `/<workspace>/plan` and the page is told it's on
 * a custom domain through the `x-opendocs-site` request header.
 *
 * Runs on the Node.js runtime (stable in Next 15.5) so it can use the
 * shared database code directly.
 */
export const config = {
  runtime: "nodejs",
  // Everything except Next's static files: the site header must be
  // stripped from every request that reaches a page or route handler.
  matcher: ["/((?!_next/static|_next/image).*)"],
};

// Same-origin routes that reader pages call: comments, the session the
// commenting layer reads, and workspace search. Every other /api route is
// OpenDocs' and doesn't exist on a customer's domain.
const READER_API_ROUTES = [
  /^\/api\/posts\/[^/]+\/comments$/,
  /^\/api\/comments\/[^/]+$/,
  /^\/api\/comments\/[^/]+\/resolve$/,
  /^\/api\/auth\/get-session$/,
  /^\/api\/workspace\/[^/]+\/search-index$/,
];

// Files in public/ that reader pages load.
const STATIC_PATHS = ["/favicon.png", "/favicon.ico", "/opendocs-icon.svg", "/og-image.png"];
const STATIC_PREFIXES = ["/_next/", "/__nextjs", "/mkdocs/"];

/** A plain page for hosts that point at us but aren't connected (or not yet). */
function notConnected(hostname: string) {
  return plainHtmlPage({
    title: "This domain isn't connected to OpenDocs",
    message: `${hostname || "This domain"} points to OpenDocs, but no workspace has connected it. If it's yours, add it in Workspace settings.`,
    links: [{ href: `${openDocsWebUrl()}/dashboard/workspace`, label: "Open Workspace settings" }],
    status: 404,
  });
}

/**
 * A 302 to a path on opendocs.cc. Next turns a middleware redirect whose
 * target shares its own internal origin into a relative one, which on a
 * custom host would point back at the custom host. That happens when the
 * app runs on localhost:<port>, so the redirect is issued by a route
 * handler instead (app/%5Fopendocs/redirect), which Next leaves alone.
 */
function redirectToOpenDocs(request: NextRequest, path: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/_opendocs/redirect";
  const headers = new Headers(request.headers);
  headers.delete(SITE_HEADER);
  headers.set(REDIRECT_HEADER, path);
  return NextResponse.rewrite(url, { request: { headers } });
}

export async function middleware(request: NextRequest) {
  // Never trust a client's copy of the site header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(SITE_HEADER);
  requestHeaders.delete(REDIRECT_HEADER);
  requestHeaders.delete(INSTANCE_FILE_HEADER);
  const pass = () => NextResponse.next({ request: { headers: requestHeaders } });

  // Caddy passes the original Host through to web:3000. X-Forwarded-Host
  // is deliberately ignored: a client could set it.
  const hostname = normalizeHostHeader(request.headers.get("host"));
  if (isOpenDocsHost(hostname)) {
    const { pathname } = request.nextUrl;
    // A self-hosted instance: the agent files with its own addresses, and
    // the dashboard instead of opendocs.cc's public website.
    if (!isOpenDocsCc() && pathname in INSTANCE_FILES) {
      const url = request.nextUrl.clone();
      url.pathname = "/_opendocs/instance-file";
      requestHeaders.set(INSTANCE_FILE_HEADER, pathname);
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
    if (isSelfHosted() && isPublicSitePath(pathname)) {
      return NextResponse.redirect(new URL("/dashboard", request.url), 307);
    }
    return pass();
  }

  const { pathname, search } = request.nextUrl;
  if (pathname === "/healthz") return pass();

  const site = await lookupCustomHost(hostname);
  if (!site) return notConnected(hostname);

  // Paused: the domain is verified but the plan no longer includes custom
  // domains. Send readers to the same page on opendocs.cc; temporary, so an
  // upgrade brings the domain straight back.
  if (!site.serving) {
    return redirectToOpenDocs(request, `${workspaceRoutePath(site.workspaceSlug, pathname)}${search}`);
  }

  requestHeaders.set(
    SITE_HEADER,
    serializeSiteContext({
      kind: "custom",
      hostname: site.hostname,
      origin: site.origin,
      workspaceId: site.workspaceId,
      workspaceSlug: site.workspaceSlug,
      workspaceName: site.workspaceName,
      logoUrl: site.logoUrl,
      showPoweredBy: site.showPoweredBy,
      opendocsOrigin: openDocsWebUrl(),
    }),
  );

  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || STATIC_PATHS.includes(pathname)) {
    return pass();
  }

  // Per-host robots.txt and sitemap.xml; the opendocs.cc ones stay static.
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    const url = request.nextUrl.clone();
    url.pathname = `/_opendocs${pathname}`;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  // Sign-in bridge (session exchange, sign out).
  if (pathname.startsWith("/_opendocs/")) return pass();

  if (pathname.startsWith("/api/")) {
    if (READER_API_ROUTES.some((route) => route.test(pathname))) return pass();
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // App pages that only exist on opendocs.cc (CUSTOM_DOMAIN_APP_PATHS). A
  // default-project document with one of these slugs keeps its links on
  // opendocs.cc (isServedOnCustomDomain).
  if (isCustomDomainAppPath(pathname)) {
    return redirectToOpenDocs(request, `${pathname}${search}`);
  }

  // Reader pages only read. Server actions belong to the dashboard and other
  // OpenDocs pages (and can arrive as plain form posts without the
  // next-action header), so on a custom domain the only writes are the
  // sign-in bridge, downloads and the reader API routes above.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
  }

  const url = request.nextUrl.clone();
  url.pathname = workspaceRoutePath(site.workspaceSlug, pathname);
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}
