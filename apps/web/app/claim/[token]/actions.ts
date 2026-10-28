"use server";

import { redirect } from "next/navigation";

import { AnonymousDocError, claimAnonymousDoc } from "@opendocs/shared/anonymous/service";
import { PlanLimitError } from "@opendocs/shared/posts/service";
import { requireServerSession } from "@/lib/auth/session";

export async function claimAnonymousDocAction(formData: FormData) {
  const session = await requireServerSession();
  const claimToken = String(formData.get("claimToken") ?? "");
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const visibility = formData.get("visibility") === "private" ? "private" : "workspace";
  const back = `/claim/${encodeURIComponent(claimToken)}`;

  let url: string;
  try {
    const post = await claimAnonymousDoc(
      session.user.id,
      { claimToken, workspaceId, visibility, confirmPublic: false },
      { client: "web" },
    );
    url = post.url;
  } catch (err) {
    const reason =
      err instanceof PlanLimitError
        ? "limit"
        : err instanceof AnonymousDocError
          ? err.code
          : "failed";
    redirect(`${back}?error=${reason}`);
  }
  redirect(url);
}
