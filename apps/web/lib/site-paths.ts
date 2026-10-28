import { siteConfig } from "@opendocs/shared/config/site";
import { isServedOnCustomDomain, stripWorkspacePrefix } from "@opendocs/shared/custom-domains/urls";

/**
 * Which site a request is for, and how reader pages build links there.
 * Client-safe (no server imports): server components get the context from
 * `getSiteContext()` (lib/site-context.ts), client components from
 * `useSite()` (components/site-provider.tsx).
 *
 * On opendocs.cc a workspace page lives at `/<workspace>/...`. On the
 * workspace's custom domain the same page is at `/...`: the middleware
 * rewrites the path, and every link a reader page renders goes through
 * `workspaceHref` so it drops the prefix again.
 */

export type CustomSiteContext = {
  kind: "custom";
  hostname: string;
  /** https://notes.example.com (http://notes.localhost:3000 in development). */
  origin: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  logoUrl: string | null;
  /** Show "Published with OpenDocs" in the footer. */
  showPoweredBy: boolean;
  /** The OpenDocs app, for links that only exist there (dashboard, sign-in). */
  opendocsOrigin: string;
};

export type SiteContext = { kind: "opendocs"; opendocsOrigin: string } | CustomSiteContext;

/** Request header the middleware sets for pages on custom domains. */
export const SITE_HEADER = "x-opendocs-site";
/** Request header carrying the opendocs.cc path for app/%5Fopendocs/redirect. */
export const REDIRECT_HEADER = "x-opendocs-redirect";

export function isCustomSite(site: SiteContext | null | undefined): site is CustomSiteContext {
  return site?.kind === "custom";
}

/**
 * A link on a reader page. Takes the opendocs.cc path (`/acme/plan`); on
 * the custom domain of `acme` returns `/plan`. Paths outside the workspace
 * (dashboard, pricing, other workspaces), and the few workspace pages the
 * custom domain can't serve (a document whose slug is an app path, like
 * `/acme/onboarding`), become absolute opendocs.cc URLs there.
 */
export function workspaceHref(site: SiteContext | null | undefined, path: string): string {
  if (!isCustomSite(site) || !path.startsWith("/") || path.startsWith("//")) return path;
  const local = stripWorkspacePrefix(site.workspaceSlug, path);
  if (local === null || !isServedOnCustomDomain(site.workspaceSlug, path)) {
    return `${site.opendocsOrigin}${path}`;
  }
  return local;
}

/** Absolute URL for canonical tags, Open Graph and JSON-LD. */
export function canonicalUrl(site: SiteContext | null | undefined, path: string): string {
  if (isCustomSite(site)) {
    const href = workspaceHref(site, path);
    if (/^https?:\/\//.test(href)) return href;
    return href === "/" ? site.origin : `${site.origin}${href}`;
  }
  return `${siteConfig.url}${path}`;
}

export function serializeSiteContext(site: CustomSiteContext): string {
  return encodeURIComponent(
    JSON.stringify({
      h: site.hostname,
      o: site.origin,
      w: site.workspaceId,
      s: site.workspaceSlug,
      n: site.workspaceName,
      l: site.logoUrl,
      p: site.showPoweredBy ? 1 : 0,
      a: site.opendocsOrigin,
    }),
  );
}

export function parseSiteContext(raw: string | null | undefined): CustomSiteContext | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    if (
      typeof value.h !== "string" ||
      typeof value.o !== "string" ||
      typeof value.w !== "string" ||
      typeof value.s !== "string" ||
      typeof value.a !== "string"
    ) {
      return null;
    }
    return {
      kind: "custom",
      hostname: value.h,
      origin: value.o,
      workspaceId: value.w,
      workspaceSlug: value.s,
      workspaceName: typeof value.n === "string" ? value.n : value.s,
      logoUrl: typeof value.l === "string" ? value.l : null,
      showPoweredBy: value.p !== 0,
      opendocsOrigin: value.a,
    };
  } catch {
    return null;
  }
}

/** The "Published with OpenDocs" link on custom domains. */
export function publishedWithOpenDocsUrl(workspaceSlug: string) {
  return `https://opendocs.cc/?utm_source=custom-domain&utm_medium=product&utm_content=${encodeURIComponent(workspaceSlug)}`;
}

/**
 * Where a custom domain sends readers to sign in (starts the bridge).
 * `quiet`: only check whether they're signed in on opendocs.cc, never
 * showing a sign-in page (lib/reader-site.ts redirectToCustomSignIn).
 */
export function customSignInHref(returnPath: string, options: { quiet?: boolean } = {}) {
  const prompt = options.quiet ? "&prompt=none" : "";
  return `/_opendocs/session?return=${encodeURIComponent(returnPath)}${prompt}`;
}
