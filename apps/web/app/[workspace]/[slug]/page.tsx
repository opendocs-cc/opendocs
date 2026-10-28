import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { siteConfig } from "@opendocs/shared/config/site";

import { DocArticle } from "@/components/doc-article";
import { RestrictedPostView } from "@/components/restricted-post-view";
import { loadArticleVersions, parseVersionParam } from "@/lib/article-versions";
import { API_BASE_URL } from "@/lib/config/api";
import { getReaderSession } from "@/lib/auth/session";
import { serializeJsonLd } from "@/lib/json-ld";
import { getPublicUserMenuData } from "@/lib/public-user-menu";
import {
  articlePublisher,
  readerPageMetadata,
  redirectToCustomDomainIfServing,
  redirectToCustomSignIn,
  relatedPostsForSite,
} from "@/lib/reader-site";
import { getSiteContext } from "@/lib/site-context";
import { canonicalUrl, workspaceHref } from "@/lib/site-paths";
import {
  getPostAccessState,
  getPostByWorkspaceSlugAndPostSlug,
  getRelatedPostsByTags,
} from "@/lib/workspaces/cached";

type DocPageProps = {
  params: Promise<{
    workspace: string;
    slug: string;
  }>;
  searchParams: Promise<{
    /** `?v=N` opens an older version (workspace members only). */
    v?: string | string[];
  }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: DocPageProps): Promise<Metadata> {
  const { workspace, slug } = await params;
  const [session, site] = await Promise.all([getReaderSession(), getSiteContext()]);
  const post = await getPostByWorkspaceSlugAndPostSlug(
    workspace,
    slug,
    session?.user.id ?? null,
  );
  if (!post) return {};
  const description = post.summary || `${post.title} - published on OpenDocs`;
  // Author field on `article:author` should be the display name or a
  // URL — we pass the workspace display name (falling back to slug)
  // because that's what readers actually see byline-wise on the page.
  const authorName = post.workspaceName || post.workspaceSlug;
  // Older versions (`?v=N`) are member-only views of the same page:
  // keep them out of search results; the canonical URL stays the same.
  const isVersionView = parseVersionParam((await searchParams).v) !== null;
  return readerPageMetadata(site, post.url, {
    noIndex: isVersionView,
    title: post.title,
    description,
    type: "article",
    // The doc's own title is already the most useful social preview
    // headline — no need to suffix " · OpenDocs" here since it's a
    // reader-facing page, not a marketing page.
    socialTitle: post.title,
    article: {
      publishedTime: post.publishedAtIso,
      modifiedTime: post.updatedAtIso,
      authors: [authorName],
      tags: post.tags,
      section: post.workspaceName,
    },
  });
}

export default async function DocPage({ params, searchParams }: DocPageProps) {
  const { workspace, slug } = await params;
  const query = await searchParams;
  const [session, site] = await Promise.all([getReaderSession(), getSiteContext()]);
  // A workspace with a custom domain is read there, every page of it: the
  // reader signs in on the domain (the bridge) for anything not public.
  await redirectToCustomDomainIfServing(site, workspace, `/${workspace}/${slug}`, query);
  const viewerUserId = session?.user.id ?? null;
  const post = await getPostByWorkspaceSlugAndPostSlug(
    workspace,
    slug,
    viewerUserId,
  );

  if (!post) {
    // Null from `getPostByWorkspaceSlugAndPostSlug` collapses two
    // distinct cases: the post doesn't exist vs. it exists but the
    // viewer can't see it. Re-probe to tell them apart — restricted
    // posts render a sign-in CTA (with redirect-back) instead of a
    // generic 404, so people who follow a shared private-doc link
    // aren't stuck at "nothing here" just because they're signed out.
    const accessState = await getPostAccessState(workspace, slug, viewerUserId);
    if (accessState === "restricted") {
      // On a custom domain, sign in through opendocs.cc and come back.
      if (!session) await redirectToCustomSignIn(site, `/${workspace}/${slug}`, query);
      return (
        <RestrictedPostView
          redirectPath={`/${workspace}/${slug}`}
          isViewerSignedIn={Boolean(session)}
        />
      );
    }
    notFound();
  }

  const userMenu = session ? await getPublicUserMenuData(session.user) : null;

  // "Related documents" below the article — other posts in this
  // workspace that share at least one tag, filtered by visibility for
  // the current viewer. Skip the round-trip entirely when the post
  // has no tags; there's nothing to match on. This runs serially
  // after the post fetch because we need `post.tags` to key the
  // query, but it's a single indexed join and is cheap enough that
  // the added latency is negligible.
  const related =
    post.tags.length > 0
      ? await getRelatedPostsByTags({
          workspaceSlug: workspace,
          excludePostSlug: slug,
          tags: post.tags,
          viewerUserId,
        })
      : { posts: [] };

  // Version history is for workspace members (the same people who can
  // comment); everyone else always gets the live version.
  const { versions, viewing } = await loadArticleVersions({
    postId: post.id,
    postUrl: workspaceHref(site, post.url),
    currentVersionNumber: post.versionNumber,
    canViewHistory: post.canComment,
    requestedVersion: parseVersionParam(query.v),
  });

  // Article JSON-LD — the single most useful structured-data entity
  // for documentation pages. Google uses it for headline, date, and
  // author decoration in search results, and Discover-style feeds
  // rely on `image` + `datePublished` for card previews. We reuse
  // the sitewide og-image as the headline image because individual
  // doc pages don't have bespoke hero images, and a consistent
  // brand image is better than none at all.
  //
  // `publisher.logo` uses the dedicated square icon (opendocs-
  // article-icon.png) — Article schema wants a logo that works at
  // small sizes, and a horizontal wordmark / 1200×630 og-image
  // reads as a thumbnail in Google's preview card.
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.summary,
    image: [`${siteConfig.url}/og-image.png`],
    datePublished: post.publishedAtIso,
    dateModified: post.updatedAtIso,
    author: {
      "@type": "Organization",
      name: post.workspaceName || post.workspaceSlug,
      url: canonicalUrl(site, `/${post.workspaceSlug}`),
    },
    publisher: articlePublisher(site, {
      name: post.workspaceName || post.workspaceSlug,
      logoUrl: post.workspaceLogoUrl,
    }),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl(site, post.url),
    },
    ...(post.tags.length > 0 ? { keywords: post.tags.join(", ") } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleJsonLd) }}
      />
      <DocArticle
        post={post}
        isViewerSignedIn={Boolean(session)}
        userMenu={userMenu}
        apiBaseUrl={API_BASE_URL}
        relatedPosts={relatedPostsForSite(related.posts, site)}
        versions={versions}
        viewingVersion={viewing}
      />
    </>
  );
}
