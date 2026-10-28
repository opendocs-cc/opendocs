"use server";

import { revalidatePath } from "next/cache";

import { requireServerSession } from "@/lib/auth/session";
import { revokeConnection } from "@opendocs/shared/mcp/connections";

export async function disconnectAppAction(connectionId: string) {
  const session = await requireServerSession();
  const ok = await revokeConnection(session.user.id, connectionId);
  if (!ok) return { error: "App not found" };
  revalidatePath("/dashboard/connected-apps");
  return { success: true };
}
