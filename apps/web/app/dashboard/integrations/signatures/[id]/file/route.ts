import { NextResponse, type NextRequest } from "next/server";

import { getServerSession } from "@/lib/auth/session";
import { isServiceError } from "@opendocs/shared/integrations/service";
import { getDraftDocument, getSignedDocument } from "@opendocs/shared/integrations/signatures";

/** The draft PDF (to read before sending), or the signed PDF and audit log once complete. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const kind = request.nextUrl.searchParams.get("kind") ?? "draft";
  if (kind !== "draft" && kind !== "signed" && kind !== "audit") {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }

  const result =
    kind === "draft" ? await getDraftDocument(session.user.id, id) : await getSignedDocument(session.user.id, id, kind);
  if (isServiceError(result)) {
    const status = result.error === "not_found" ? 404 : result.error === "forbidden" || result.error === "plan_required" ? 403 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  const ascii = result.filename.replace(/[^\x20-\x7e]+/g, "-").replace(/["\\]/g, "");
  // The draft opens in the browser's PDF viewer; finished documents download.
  const disposition = kind === "draft" ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
