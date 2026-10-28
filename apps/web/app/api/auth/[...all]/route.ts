import { NextResponse } from "next/server";

import { extensionPreflight, withExtensionCors } from "@/lib/auth/extension-cors";
import { getReaderSession } from "@/lib/auth/session";
import { getSiteContext } from "@/lib/site-context";
import { isCustomSite } from "@/lib/site-paths";

export const dynamic = "force-dynamic";

/**
 * On a custom domain Better Auth isn't reachable (sign-in happens on
 * opendocs.cc through the bridge). The one call reader pages make here,
 * `get-session` from the commenting layer, answers from the viewer
 * session in Better Auth's shape; everything else is 404.
 */
async function customDomainAuth(request: Request) {
  if (request.method !== "GET" || !new URL(request.url).pathname.endsWith("/get-session")) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const session = await getReaderSession();
  if (!session) return NextResponse.json(null);
  const { id, name, email, image } = session.user;
  return NextResponse.json({ user: { id, name, email, image: image ?? null } });
}

export async function GET(request: Request) {
  if (isCustomSite(await getSiteContext())) return customDomainAuth(request);
  const { auth } = await import("@/lib/auth");
  const { toNextJsHandler } = await import("better-auth/next-js");
  return toNextJsHandler(auth).GET(request);
}

export async function POST(request: Request) {
  if (isCustomSite(await getSiteContext())) return customDomainAuth(request);
  const { auth } = await import("@/lib/auth");
  const { toNextJsHandler } = await import("better-auth/next-js");
  return withExtensionCors(request, await toNextJsHandler(auth).POST(request));
}

// The browser extension's token and revoke calls (lib/auth/extension-cors.ts).
export function OPTIONS(request: Request) {
  return extensionPreflight(request);
}
