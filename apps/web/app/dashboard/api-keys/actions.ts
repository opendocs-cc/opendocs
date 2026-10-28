"use server";

import { revalidatePath } from "next/cache";

import { requireServerSession } from "@/lib/auth/session";
import { getOnboardingState } from "@/lib/workspaces/cached";
import { createApiKey, revokeApiKey } from "@opendocs/shared/api-keys/service";

export async function createApiKeyAction(name: string) {
  const session = await requireServerSession();
  const onboarding = await getOnboardingState(session.user.id);

  if (!onboarding.workspace) {
    return { error: "No workspace found" };
  }

  const result = await createApiKey(
    session.user.id,
    onboarding.workspace.id,
    name,
  );

  revalidatePath("/dashboard/api-keys");

  return {
    id: result.id,
    label: result.label,
    keyHint: result.keyHint,
    plaintext: result.plaintext,
    createdAt: result.createdAt.toISOString(),
  };
}

export async function revokeApiKeyAction(keyId: string) {
  const session = await requireServerSession();
  const result = await revokeApiKey(session.user.id, keyId);

  if (!result) {
    return { error: "Key not found" };
  }

  revalidatePath("/dashboard/api-keys");
  return { success: true };
}
