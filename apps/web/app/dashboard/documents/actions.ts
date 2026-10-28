"use server";

import { revalidatePath } from "next/cache";

import { requireServerSession } from "@/lib/auth/session";
import {
  PlanLimitError,
  publishPostForUser,
  deleteWorkspacePostForUser,
  changeWorkspacePostVisibilityForUser,
} from "@opendocs/shared/posts/service";
import { publishInputSchema } from "@opendocs/shared/posts/validation";
import { getPostLinks, getPublicUrlForPost } from "@opendocs/shared/custom-domains/service";

export async function publishDocumentAction(input: {
  title?: string;
  markdown: string;
  workspaceId: string;
  projectId?: string;
  visibility: string;
  confirmPublic: boolean;
  tags: string[];
}) {
  const session = await requireServerSession();

  const parsed = publishInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  try {
    const result = await publishPostForUser(session.user.id, parsed.data);
    revalidatePath("/dashboard/documents");
    revalidatePath("/dashboard");
    return {
      success: true,
      id: result.postId,
      url: result.url,
      // The link to share: the custom domain for public documents when the
      // workspace has one, opendocs.cc otherwise.
      publicUrl: await getPublicUrlForPost(result.postId),
      slug: result.slug,
      title: result.title,
      visibility: input.visibility,
      tags: result.tags,
    };
  } catch (err) {
    // Surface quota errors as a structured shape so the client can
    // render a tailored toast and short-circuit any remaining uploads
    // in a bulk drop.
    if (err instanceof PlanLimitError) {
      return {
        error: "document_limit" as const,
        plan: err.plan,
        limit: err.limit,
        used: err.used,
      };
    }
    return { error: err instanceof Error ? err.message : "Unable to publish." };
  }
}

export async function changeVisibilityAction(
  postId: string,
  visibility: string,
) {
  const session = await requireServerSession();

  const validVisibilities = ["private", "workspace", "public"] as const;
  type V = (typeof validVisibilities)[number];

  if (!validVisibilities.includes(visibility as V)) {
    return { error: "Invalid visibility value." };
  }

  try {
    await changeWorkspacePostVisibilityForUser(
      session.user.id,
      postId,
      visibility as V,
      visibility === "public" ? true : undefined,
    );
    revalidatePath("/dashboard/documents");
    // Going public (or not) moves the shareable link on or off the
    // workspace's custom domain.
    return { success: true, publicUrl: await getPublicUrlForPost(postId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unable to change visibility." };
  }
}

export async function deleteDocumentAction(postId: string) {
  const session = await requireServerSession();

  try {
    await deleteWorkspacePostForUser(session.user.id, postId);
    revalidatePath("/dashboard/documents");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unable to delete." };
  }
}

/**
 * Loop wrapper around `deleteWorkspacePostForUser` for the table's multi-select
 * bulk action. We iterate on the server (one HTTP round-trip instead
 * of N) and collect per-id outcomes so the client can render a single
 * "X deleted, Y failed" toast and keep failed rows still selected for
 * a retry.
 *
 * Best-effort, not transactional — a failure on row 5 doesn't roll
 * back rows 1-4. That tradeoff is fine here because each delete is
 * independent and the user generally wants "do as much as you can".
 *
 * Revalidate is fired once at the end (not per-iteration) so we don't
 * thrash the cache for a 10-document delete.
 */
export async function bulkDeleteDocumentsAction(postIds: string[]) {
  const session = await requireServerSession();

  if (!Array.isArray(postIds) || postIds.length === 0) {
    return { error: "No documents selected." };
  }

  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of postIds) {
    try {
      await deleteWorkspacePostForUser(session.user.id, id);
      succeeded.push(id);
    } catch (err) {
      failed.push({
        id,
        error: err instanceof Error ? err.message : "Unable to delete.",
      });
    }
  }

  revalidatePath("/dashboard/documents");
  revalidatePath("/dashboard");

  return { success: true, succeeded, failed };
}

/**
 * Same shape as `bulkDeleteDocumentsAction` but for visibility
 * changes. Public visibility is auto-confirmed at the service layer
 * via the `confirmPublic` flag — the client side already routes the
 * user through a "publish N publicly?" alert before calling this, so
 * by the time we get here consent is implicit.
 */
export async function bulkChangeVisibilityAction(
  postIds: string[],
  visibility: string,
) {
  const session = await requireServerSession();

  const validVisibilities = ["private", "workspace", "public"] as const;
  type V = (typeof validVisibilities)[number];

  if (!validVisibilities.includes(visibility as V)) {
    return { error: "Invalid visibility value." };
  }

  if (!Array.isArray(postIds) || postIds.length === 0) {
    return { error: "No documents selected." };
  }

  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of postIds) {
    try {
      await changeWorkspacePostVisibilityForUser(
        session.user.id,
        id,
        visibility as V,
        visibility === "public" ? true : undefined,
      );
      succeeded.push(id);
    } catch (err) {
      failed.push({
        id,
        error:
          err instanceof Error ? err.message : "Unable to change visibility.",
      });
    }
  }

  revalidatePath("/dashboard/documents");

  const links = await getPostLinks(succeeded);
  const publicUrls = Object.fromEntries([...links].map(([id, link]) => [id, link.publicUrl]));
  return { success: true, succeeded, failed, publicUrls };
}
