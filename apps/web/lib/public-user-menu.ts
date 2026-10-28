import type { PublicUserMenuData } from "@/components/public-user-menu";
import { getSiteContext } from "@/lib/site-context";
import { isCustomSite } from "@/lib/site-paths";
import {
  getProfileSettings,
  getUserCompedTier,
  getUserEffectiveBillingTier,
  getUserWorkspaces,
} from "@/lib/workspaces/cached";

export async function getPublicUserMenuData(
  user: { id: string; email: string },
): Promise<PublicUserMenuData> {
  // On a custom domain the page belongs to someone else's workspace, and
  // whatever is passed here ends up in the page's payload. Only what the
  // sign-in confirmation names (name, email, picture): never the reader's
  // other workspaces, plan or username.
  if (isCustomSite(await getSiteContext())) {
    const profileSettings = await getProfileSettings(user.id);
    return {
      displayName: profileSettings?.fullName?.trim() || user.email.split("@")[0] || user.email,
      username: null,
      email: user.email,
      avatarUrl: profileSettings?.profilePictureUrl ?? null,
      plan: "free",
      compedTier: null,
      workspaces: [],
    };
  }

  const [profileSettings, workspaces] = await Promise.all([
    getProfileSettings(user.id),
    getUserWorkspaces(user.id),
  ]);
  const [effectivePlan, compedTier] = await Promise.all([
    getUserEffectiveBillingTier(user.id),
    getUserCompedTier(user.id),
  ]);

  const username = profileSettings?.username ?? null;
  const displayName =
    profileSettings?.fullName?.trim() ||
    username ||
    user.email.split("@")[0] ||
    user.email;

  return {
    displayName,
    username,
    email: user.email,
    avatarUrl: profileSettings?.profilePictureUrl ?? null,
    plan: effectivePlan,
    compedTier,
    workspaces: workspaces.map((workspace) => ({
      id: workspace.workspaceId,
      name: workspace.name,
      slug: workspace.slug,
      logoUrl: workspace.logoUrl,
      role: workspace.role as "owner" | "admin" | "member",
    })),
  };
}
