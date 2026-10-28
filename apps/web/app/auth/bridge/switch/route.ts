import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { openDocsWebUrl } from "@opendocs/shared/custom-domains/urls";

import { auth } from "@/lib/auth";
import { bridgePath, checkBridgeRequest } from "@/lib/custom-domain-bridge";

export const dynamic = "force-dynamic";

/**
 * POST /auth/bridge/switch: "Use another account" on the bridge's
 * no-access page. Signs out of OpenDocs and opens the sign-in page, which
 * continues the same custom-domain sign-in afterwards. Only from our own
 * page (Origin check).
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(openDocsWebUrl()).origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    form = new FormData();
  }
  const bridge = await checkBridgeRequest(request, {
    get: (name) => {
      const value = form.get(name);
      return typeof value === "string" ? value : null;
    },
  });
  if (bridge instanceof Response) return bridge;

  const signedOut = await auth.api.signOut({ headers: await headers(), asResponse: true });
  const response = NextResponse.redirect(
    `${openDocsWebUrl()}/login?redirect=${encodeURIComponent(bridgePath(bridge))}`,
    303,
  );
  for (const cookie of signedOut.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  response.headers.set("cache-control", "no-store");
  return response;
}
