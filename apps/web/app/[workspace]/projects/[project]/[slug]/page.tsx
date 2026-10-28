import type { Metadata } from "next";
import { notFound } from "next/navigation";

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
import { siteConfig } from "@opendocs/shared/config/site";

type ProjectDocPageProps = {
  params: Promise<{
    workspace: string;
    project: string;
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
}: ProjectDocPageProps): Promise<Metadata> {
  const { workspace, project, slug } = await params;
  const [session, site] = await Promise.all([getReaderSession(), getSiteContext()]);
  const post = await getPostByWorkspaceSlugAndPostSlug(
    workspace,
    slug,
    session?.user.id ?? null,
    project,
  );
  if (!post) return {};
  const authorName = post.workspaceName || post.workspaceSlug;
  // Older versions (`?v=N`) are member-only views of the same page:
  // keep them out of search results; the canonical URL stays the same.
  const isVersionView = parseVersionParam((await searchParams).v) !== null;
  return readerPageMetadata(site, post.url, {
    noIndex: isVersionView,
    title: post.title,
    description: post.summary || `${post.title} - published on OpenDocs`,
    type: "article",
    socialTitle: post.title,
    article: {
      publishedTime: post.publishedAtIso,
      modifiedTime: post.updatedAtIso,
      authors: [authorName],
      tags: post.tags,
      section: post.projectName,
    },
  });
}

export default async function ProjectDocPage({
  params,
  searchParams,
}: ProjectDocPageProps) {
  const { workspace, project, slug } = await params;
  const query = await searchParams;
  const [session, site] = await Promise.all([getReaderSession(), getSiteContext()]);
  // A workspace with a custom domain is read there, every page of it: the
  // reader signs in on the domain (the bridge) for anything not public.
  await redirectToCustomDomainIfServing(site, workspace, `/${workspace}/projects/${project}/${slug}`, query);
  const viewerUserId = session?.user.id ?? null;
  const post = await getPostByWorkspaceSlugAndPostSlug(
    workspace,
    slug,
    viewerUserId,
    project,
  );

  if (!post) {
    const accessState = await getPostAccessState(
      workspace,
      slug,
      viewerUserId,
      project,
    );
    if (accessState === "restricted") {
      // On a custom domain, sign in through opendocs.cc and come back.
      if (!session) await redirectToCustomSignIn(site, `/${workspace}/projects/${project}/${slug}`, query);
      return (
        <RestrictedPostView
          redirectPath={`/${workspace}/projects/${project}/${slug}`}
          isViewerSignedIn={Boolean(session)}
        />
      );
    }
    notFound();
  }

  const userMenu = session ? await getPublicUserMenuData(session.user) : null;

  const related =
    post.tags.length > 0
      ? await getRelatedPostsByTags({
          workspaceSlug: workspace,
          projectSlug: project,
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
      url: canonicalUrl(site, `/${post.workspaceSlug}/projects/${post.projectSlug}`),
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
