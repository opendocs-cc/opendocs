import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createComment,
  listCommentsForPost,
} from "@opendocs/shared/comments/service";

import { getReaderSession } from "@/lib/auth/session";
import { notifyCommentAdded } from "@/lib/comments/notify";
import { isForeignWrite, isPostOnCurrentSite } from "@/lib/comments/site-guard";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ postId: string }>;
};

const createSchema = z.object({
  body: z.string().min(1).max(4000),
  parentCommentId: z.string().nullish(),
  anchor: z
    .object({
      quotedText: z.string().min(1).max(1000),
      anchorBefore: z.string().max(200),
      anchorAfter: z.string().max(200),
      startOffset: z.number().int().min(0),
      endOffset: z.number().int().min(0),
    })
    .nullish(),
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

// On a custom domain the reader is signed in through the viewer session
// (lib/auth/session.ts), which may read and comment.
function notOnThisSite() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { postId } = await ctx.params;
  if (!(await isPostOnCurrentSite(postId))) return notOnThisSite();
  const session = await getReaderSession();
  try {
    const comments = await listCommentsForPost(
      postId,
      session?.user.id ?? null,
    );
    return NextResponse.json({ comments });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { postId } = await ctx.params;
  if (await isForeignWrite(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await isPostOnCurrentSite(postId))) return notOnThisSite();
  const session = await getReaderSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const comment = await createComment({
      postId,
      authorUserId: session.user.id,
      body: parsed.data.body,
      parentCommentId: parsed.data.parentCommentId ?? null,
      anchor: parsed.data.anchor ?? null,
    });

    // Fire-and-forget notification. We await it so the request hangs
    // a moment rather than returning before the email goes out —
    // simpler than a queue and the API is already behind user-driven
    // latency (commenter sees the spinner until the POST returns).
    // If Resend is down the notifier swallows the error so the
    // comment insert isn't lost.
    await notifyCommentAdded(comment, session.user.id).catch((err) => {
      console.error("[comments] notification failed", err);
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
