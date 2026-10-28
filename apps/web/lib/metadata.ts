import type { Metadata } from "next";

import { withInstanceUrls } from "@opendocs/shared/config/instance";
import { siteConfig } from "@opendocs/shared/config/site";

/**
 * Public-facing social preview helpers.
 *
 * Why this exists: Next.js' Metadata API does NOT deeply merge `openGraph`
 * (or `twitter`) across route segments. When a child page exports its own
 * `openGraph: { title, description }` without `images`, the root layout's
 * `images` is dropped and the preview card renders with no picture at all.
 *
 * So every page that wants a bespoke title/description needs to restate
 * the og:image. Rather than relying on callers to remember, we centralise
 * it here — pass a title (and optionally a description + url) and get a
 * full Metadata object with og:image and twitter:image wired in.
 */

const OG_IMAGE_URL = "/og-image.png";

/**
 * OpenDocs' X / Twitter handle. Exported so callers that inline raw
 * Metadata (e.g. root layout fallbacks) share the same value — change
 * it here and every surface follows.
 */
export const TWITTER_HANDLE = "@opendocshq";

const OG_IMAGE_DESCRIPTOR = {
  url: OG_IMAGE_URL,
  width: 1200,
  height: 630,
  alt: siteConfig.name,
  // Some OG scrapers (notably LinkedIn) require an explicit MIME type
  // to pick up the image — it's a no-op for Google / Twitter.
  type: "image/png",
} as const;

/**
 * Article-specific OpenGraph fields. Only meaningful when `type` is
 * `"article"` (Next.js ignores them otherwise); captured as a single
 * optional object so callers opt in by passing `article: {...}` rather
 * than having five unrelated top-level fields.
 */
export interface ArticleMetadataInput {
  /** ISO-8601 timestamp of original publication. */
  publishedTime?: string;
  /** ISO-8601 timestamp of the last edit. */
  modifiedTime?: string;
  /**
   * Display names or URLs of the article's authors. `article:author`
   * in the OG spec is repeatable — pass all authors as an array.
   */
  authors?: string[];
  /** Free-form tag list — maps to repeated `article:tag` meta tags. */
  tags?: string[];
  /**
   * Broad category / section (e.g. the owning workspace name). Single
   * value per the OG spec.
   */
  section?: string;
}

export interface PageMetadataInput {
  /**
   * Top-level `<title>`. Runs through the root layout's title template
   * (`"%s · OpenDocs"`), so pass the page-specific part only (e.g.
   * `"Pricing"`, not `"Pricing · OpenDocs"`). Use `{ absolute: "..." }`
   * if you need to bypass the template entirely.
   */
  title: string | { absolute: string };
  /** Defaults to the site description when omitted. */
  description?: string;
  /**
   * Canonical URL for the page — absolute or root-relative. Defaults to
   * the site root, which is the right answer for static marketing pages.
   * Dynamic routes (published docs, workspace profiles) should pass an
   * explicit URL so the OG card links back to the correct page.
   *
   * This also drives `alternates.canonical`, which tells Google to
   * treat this URL as the source of truth when aggregating signals —
   * strips out `?utm_*` query parameters and prevents duplicate-URL
   * fragmentation from eating our ranking.
   */
  url?: string;
  /**
   * Social preview title — reused for both `openGraph.title` and
   * `twitter.title`. Defaults to `"${title} · OpenDocs"` so the preview
   * reads the same as the browser tab. openGraph titles don't get run
   * through the title template the way the top-level `title` does, so
   * we append the site name by hand.
   */
  socialTitle?: string;
  /**
   * `"article"` for published documents, `"website"` for everything else.
   * Defaults to `"website"`.
   */
  type?: "website" | "article";
  /**
   * Article-specific OG fields — only consulted when `type === "article"`.
   * Populates `article:published_time`, `article:modified_time`,
   * `article:author`, `article:tag`, and `article:section`.
   */
  article?: ArticleMetadataInput;
  /**
   * Prevent search engines from indexing this page. Use for transactional
   * or post-flow pages where a Google result would be worthless to users
   * (password reset confirmations, "account deleted" landing, etc.). We
   * still allow `follow` so outbound links from the page pass PageRank.
   */
  noIndex?: boolean;
  /**
   * `og:site_name` and the suffix of the default social title. OpenDocs
   * unless the page is on a workspace's custom domain.
   */
  siteName?: string;
}

/**
 * Build a complete Next.js `Metadata` object for a public page, with
 * `openGraph` and `twitter` fully populated — including `og:image` and
 * `twitter:image` pointing at `/og-image.png`, a canonical URL, and
 * article fields when `type === "article"`.
 */
export function buildPageMetadata({
  title,
  description,
  url,
  socialTitle,
  type = "website",
  article,
  noIndex = false,
  siteName = siteConfig.name,
}: PageMetadataInput): Metadata {
  const desc = description ?? siteConfig.description;
  const plainTitle = typeof title === "string" ? title : title.absolute;
  const resolvedSocialTitle =
    socialTitle ?? `${plainTitle} · ${siteName}`;
  // Pages pass opendocs.cc URLs; a self-hosted instance serves its own.
  const resolvedUrl = withInstanceUrls(url ?? siteConfig.url);

  // Spread the article sub-object into openGraph only when relevant — a
  // spurious `publishedTime: undefined` on a "website" page would still
  // emit a blank `<meta property="article:published_time" content="">`.
  const articleFields =
    type === "article" && article
      ? {
          publishedTime: article.publishedTime,
          modifiedTime: article.modifiedTime,
          authors: article.authors,
          tags: article.tags,
          section: article.section,
        }
      : {};

  return {
    title,
    description: desc,
    alternates: {
      canonical: resolvedUrl,
    },
    openGraph: {
      type,
      locale: "en_US",
      url: resolvedUrl,
      siteName,
      title: resolvedSocialTitle,
      description: desc,
      images: [OG_IMAGE_DESCRIPTOR],
      ...articleFields,
    },
    twitter: {
      card: "summary_large_image",
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
      title: resolvedSocialTitle,
      description: desc,
      images: [OG_IMAGE_URL],
    },
    ...(noIndex
      ? {
          // `follow: true` because the page itself shouldn't appear in
          // results, but any canonical / internal links from it still
          // should carry weight.
          robots: { index: false, follow: true },
        }
      : {}),
  };
}
