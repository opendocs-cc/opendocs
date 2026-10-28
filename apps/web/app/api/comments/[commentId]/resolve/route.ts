import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { setCommentResolution } from "@opendocs/shared/comments/service";

import { getReaderSession } from "@/lib/auth/session";
import { isCommentOnCurrentSite, isForeignWrite } from "@/lib/comments/site-guard";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ commentId: string }>;
};

const resolveSchema = z.object({
  resolved: z.boolean(),
});

function errorResponse(err: unknown) {
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    "status" in err &&
    "message" in err
  ) {
    const e = err as { code: string; status: number; message: string };
    return NextResponse.json(
      { error: e.code, message: e.message },
      { status: e.status },
    );
  }
  console.error("[comments] unexpected error", err);
  return NextResponse.json(
    { error: "internal_error" },
    { status: 500 },
  );
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { commentId } = await ctx.params;
  if (await isForeignWrite(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await isCommentOnCurrentSite(commentId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const session = await getReaderSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = resolveSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const comment = await setCommentResolution(
      commentId,
      session.user.id,
      parsed.data.resolved,
    );
    return NextResponse.json({ comment });
  } catch (err) {
    return errorResponse(err);
  }
}
