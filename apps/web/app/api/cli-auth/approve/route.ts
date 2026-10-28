import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  approveCliLoginRequest,
  CliAuthError,
} from "@opendocs/shared/cli-auth/service";
import { getServerSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const approveSchema = z.object({
  requestId: z.string().min(1),
  state: z.string().min(32),
  workspaceId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const parsed = approveSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", message: "Invalid CLI approval request." },
        { status: 400 },
      );
    }

    const result = await approveCliLoginRequest({
      id: parsed.data.requestId,
      state: parsed.data.state,
      userId: session.user.id,
      workspaceId: parsed.data.workspaceId,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof CliAuthError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === "forbidden" ? 403 : 400 },
      );
    }
    throw err;
  }
}
