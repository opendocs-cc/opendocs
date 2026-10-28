import type { Metadata } from "next";
import { cookies } from "next/headers";
import { permanentRedirect, redirect } from "next/navigation";

import { siteConfig } from "@opendocs/shared/config/site";
import { signInCheckedCookieName } from "@opendocs/shared/custom-domains/bridge";
import { getServingCustomDomainForSlug } from "@opendocs/shared/custom-domains/service";
import { customDomainUrl, isServedOnCustomDomain } from "@opendocs/shared/custom-domains/urls";

import { buildPageMetadata, type PageMetadataInput } from "@/lib/metadata";
import {
  canonicalUrl,
  customSignInHref,
  isCustomSite,
  workspaceHref,
  type SiteContext,
} from "@/lib/site-paths";

/**
 * Server helpers for the reader pages under app/[workspace]: the same page
 * renders on opendocs.cc and on the workspace's custom domain, and these
 * keep the links, redirects and metadata right for whichever one it is.
 */

type SearchParams = Record<string, string | string[] | undefined>;

export function toQueryString(searchParams: SearchParams | undefined): string {
  if (!searchParams) return "";
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.append(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

/**
 * On opendocs.cc, every page of a workspace whose custom domain serves
 * moves there (308, with its query string): public pages for good, and
 * private ones too, where the reader signs in through the bridge (members
 * go straight through). Called first thing, with the path from the URL,
 * so it doesn't depend on who's asking. Documents whose slug is an app
 * path (`/acme/onboarding`) stay on opendocs.cc. The response is
 * `no-store` like every dynamic page, so a domain that's later paused or
 * removed doesn't leave browsers stuck on a cached redirect.
 */
export async function redirectToCustomDomainIfServing(
  site: SiteContext,
  workspaceSlug: string,
  path: string,
  searchParams?: SearchParams,
) {
  if (isCustomSite(site)) return;
  const slug = workspaceSlug.toLowerCase();
  const canonicalPath = path.replace(/^\/[^/]+/, `/${slug}`);
  if (!isServedOnCustomDomain(slug, canonicalPath)) return;
  const domain = await getServingCustomDomainForSlug(slug);
  if (!domain) return;
  permanentRedirect(`${customDomainUrl(domain.hostname, slug, canonicalPath)}${toQueryString(searchParams)}`);
}

/**
 * On a custom domain, a reader without a session who opens something that
 * isn't public: a quiet check on opendocs.cc first, which brings members
 * already signed in there straight back signed in, and everyone else back
 * without a sign-in page. After that (the cookie set by
 * app/%5Fopendocs/session, for half an hour) the page renders its private
 * view, whose "Sign in" button starts the full sign-in.
 */
export async function redirectToCustomSignIn(site: SiteContext, path: string, searchParams?: SearchParams) {
  if (!isCustomSite(site)) return;
  const secure = site.origin.startsWith("https://");
  if ((await cookies()).has(signInCheckedCookieName(secure))) return;
  redirect(customSignInHref(`${workspaceHref(site, path)}${toQueryString(searchParams)}`, { quiet: true }));
}

type LinkedProfile = {
  posts: Array<{ url: string; tagBasePath: string }>;
  project: { path: string };
  projects: Array<{ path: string }>;
};

/** Profile links (documents, tags, projects) for the current site. */
export function profileForSite<T extends LinkedProfile>(profile: T, site: SiteContext): T {
  if (!isCustomSite(site)) return profile;
  return {
    ...profile,
    posts: profile.posts.map((post) => ({
      ...post,
      url: workspaceHref(site, post.url),
      tagBasePath: workspaceHref(site, post.tagBasePath),
    })),
    project: { ...profile.project, path: workspaceHref(site, profile.project.path) },
    projects: profile.projects.map((project) => ({
      ...project,
      path: workspaceHref(site, project.path),
    })),
  };
}

/** Related-document links for the current site. */
export function relatedPostsForSite<T extends { url: string; tagBasePath: string }>(
  postsList: T[],
  site: SiteContext,
): T[] {
  if (!isCustomSite(site)) return postsList;
  return postsList.map((post) => ({
    ...post,
    url: workspaceHref(site, post.url),
    tagBasePath: workspaceHref(site, post.tagBasePath),
  }));
}

/**
 * Page metadata with the canonical URL for the current site. On a custom
 * domain the title and site name are the workspace's, not OpenDocs'.
 */
export function readerPageMetadata(
  site: SiteContext,
  path: string,
  input: Omit<PageMetadataInput, "url">,
): Metadata {
  const url = canonicalUrl(site, path);
  if (!isCustomSite(site)) return buildPageMetadata({ ...input, url });
  const plainTitle = typeof input.title === "string" ? input.title : input.title.absolute;
  // "Plan · Acme", but not "Launch - Acme · Acme" for titles that already
  // end in the workspace's name (project pages).
  const title =
    typeof input.title === "string" && !plainTitle.endsWith(site.workspaceName)
      ? { absolute: `${plainTitle} · ${site.workspaceName}` }
      : { absolute: plainTitle };
  return buildPageMetadata({ ...input, title, url, siteName: site.workspaceName });
}

/**
 * Article JSON-LD `publisher`: OpenDocs on opendocs.cc, the workspace on
 * its own domain.
 */
export function articlePublisher(site: SiteContext, workspace: { name: string; logoUrl: string | null }) {
  if (isCustomSite(site)) {
    return {
      "@type": "Organization",
      name: workspace.name,
      url: site.origin,
      ...(workspace.logoUrl ? { logo: { "@type": "ImageObject", url: workspace.logoUrl } } : {}),
    };
  }
  return {
    "@type": "Organization",
    name: siteConfig.name,
    logo: {
      "@type": "ImageObject",
      url: `${siteConfig.url}/opendocs-article-icon.png`,
    },
  };
}
