import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import { user, usernames, workspaces } from "../db/schema";
import { RESERVED_USERNAMES, usernameSchema } from "../usernames";
import { completeOnboarding, getOnboardingState } from "../workspaces/service";
import { isReservedWorkspaceSlug, workspaceSlugSchema } from "../workspaces/validation";

/**
 * Turns an email address into a username candidate: the local part,
 * lowercased, with anything outside [a-z0-9_-] collapsed to "-".
 * "Jane.Doe+work@acme.com" → "jane-doe-work".
 */
export function usernameBaseFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  let base = local
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 24);
  if (base.length < 3) base = `${base || "user"}-docs`.replace(/^-/, "");
  return base;
}

/** "jane-doe-work" → "Jane Doe Work". Used for the display and workspace name. */
export function displayNameFromUsername(username: string): string {
  return username
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function isUsernameAvailable(candidate: string): Promise<boolean> {
  if (!usernameSchema.safeParse(candidate).success) return false;
  if (RESERVED_USERNAMES.has(candidate)) return false;
  const database = getDbOrThrow();
  const [taken] = await database
    .select({ id: usernames.id })
    .from(usernames)
    .where(eq(usernames.normalizedUsername, candidate))
    .limit(1);
  return !taken;
}

async function isWorkspaceSlugAvailable(candidate: string): Promise<boolean> {
  if (!workspaceSlugSchema.safeParse(candidate).success) return false;
  if (isReservedWorkspaceSlug(candidate)) return false;
  const database = getDbOrThrow();
  const [taken] = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, candidate))
    .limit(1);
  return !taken;
}

async function pickUsername(base: string): Promise<string> {
  if (await isUsernameAvailable(base)) return base;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `${base}-${randomInt(1000, 10000)}`;
    if (await isUsernameAvailable(candidate)) return candidate;
  }
  throw new Error("Could not find an available username.");
}

/**
 * Finishes onboarding for an account created through an email sign-in code
 * so an agent can publish immediately: picks a username from the email,
 * creates a workspace with the same slug (or an auto-suffixed one) and its
 * default project, and fills in an empty display name.
 *
 * Accounts that already finished onboarding are returned unchanged. An
 * invited user who has a membership but no username only gets a username.
 */
export async function ensureAgentAccount(userId: string) {
  const state = await getOnboardingState(userId);
  if (state.completed) {
    return { onboarding: state, onboardingCreated: false };
  }

  const database = getDbOrThrow();
  const [account] = await database
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!account) {
    throw new Error("User not found.");
  }

  const username = state.username ?? (await pickUsername(usernameBaseFromEmail(account.email)));
  const displayName = account.name?.trim() || displayNameFromUsername(username);

  const onboarding = await completeOnboarding({
    userId,
    username,
    fullName: displayName,
    ...(state.hasWorkspace
      ? {}
      : {
          workspaceName: displayName,
          ...((await isWorkspaceSlugAvailable(username)) ? { workspaceSlug: username } : {}),
        }),
  });

  if (!account.name?.trim()) {
    await database
      .update(user)
      .set({ name: displayName, updatedAt: new Date() })
      .where(eq(user.id, userId));
  }

  return { onboarding, onboardingCreated: true };
}
