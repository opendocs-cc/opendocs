import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { requireServerSession } from "@/lib/auth/session";
import { dismissTeamInviteOnboarding } from "@/lib/workspaces/cached";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await requireServerSession();
  const dismissedAt = await dismissTeamInviteOnboarding(session.user.id);

  revalidatePath("/dashboard");

  return NextResponse.json({
    dismissedAt: dismissedAt?.toISOString() ?? null,
  });
}
