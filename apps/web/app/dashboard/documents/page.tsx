import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";

import { requireServerSession } from "@/lib/auth/session";
import { getDashboardData, getUserWorkspaces } from "@/lib/workspaces/cached";
import { getDocumentQuota } from "@opendocs/shared/billing/quota";
import { listProjectsForUser } from "@opendocs/shared/projects/service";
import { getPostLinks } from "@opendocs/shared/custom-domains/service";

import { DocumentsClient } from "./documents-client";

export const metadata: Metadata = { title: "Documents" };

function DocumentsSkeleton() {
  return (
    <div className="w-full min-h-full">
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-[30px] bg-gray-100 rounded w-40 animate-pulse" />
            <div className="h-[24px] bg-gray-100 rounded w-72 animate-pulse mt-2" />
          </div>
          <div className="h-10 bg-gray-100 rounded w-40 animate-pulse" />
        </div>
        <div className="bg-white rounded-xl border border-[#e5e5e5]">
          <div className="animate-pulse p-6 space-y-4">
            <div className="h-32 bg-gray-100 rounded-lg border-2 border-dashed border-[#e5e5e5]" />
            <div className="h-40 bg-gray-100 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

async function DocumentsContent() {
  const session = await requireServerSession();

  // Resolve active workspace from cookie
  const cookieStore = await cookies();
  const activeWsCookie = cookieStore.get("active_workspace_id")?.value;
  const allWorkspaces = await getUserWorkspaces(session.user.id);
  const activeWs = activeWsCookie
    ? allWorkspaces.find((w) => w.workspaceId === activeWsCookie) ?? allWorkspaces[0]
    : allWorkspaces[0];

  const workspaceId = activeWs?.workspaceId ?? "";
  const allowPublicDocuments = activeWs?.allowPublicDocuments ?? false;

  // Fetch documents scoped to the active workspace
  const data = await getDashboardData(session.user.id, workspaceId || undefined);

  // Fetch the document quota so the client can render a usage hint
  // and short-circuit bulk uploads that would exceed the cap. Falls
  // back to an unlimited sentinel when there's no workspace yet.
  const quota = workspaceId
    ? await getDocumentQuota(workspaceId)
    : {
        plan: "free" as const,
        limit: Number.POSITIVE_INFINITY,
        used: 0,
        remaining: Number.POSITIVE_INFINITY,
      };
  const projects = workspaceId
    ? (await listProjectsForUser(session.user.id, workspaceId)) ?? []
    : [];

  // View and Copy link use the link readers should get: the workspace's
  // custom domain when it has one.
  const links = await getPostLinks(data.posts.map((post) => post.id));
  const posts = data.posts.map((post) => ({
    id: post.id,
    title: post.title,
    slug: post.slug,
    url: post.url,
    publicUrl: links.get(post.id)?.publicUrl ?? null,
    visibility: post.visibility as "private" | "workspace" | "restricted" | "public",
    isPublished: post.isPublished,
    updatedAt: new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
      post.updatedAt,
    ),
    updatedAtIso: post.updatedAt.toISOString(),
    publishedAtIso: post.publishedAt.toISOString(),
    projectId: post.projectId,
    summary: post.summary ?? "",
    tags: post.tags,
    client: post.client ?? null,
  }));

  return (
    <DocumentsClient
      workspaceId={workspaceId}
      allowPublicDocuments={allowPublicDocuments}
      initialPosts={posts}
      projects={projects.map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        isDefault: project.isDefault,
        postCount: project.postCount,
      }))}
      quota={{
        plan: quota.plan,
        // `Infinity` can't survive the server→client boundary as a
        // number, so serialize to `null` and let the client treat
        // null as "unlimited".
        limit: Number.isFinite(quota.limit) ? quota.limit : null,
        used: quota.used,
        remaining: Number.isFinite(quota.remaining) ? quota.remaining : null,
      }}
    />
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<DocumentsSkeleton />}>
      <DocumentsContent />
    </Suspense>
  );
}
