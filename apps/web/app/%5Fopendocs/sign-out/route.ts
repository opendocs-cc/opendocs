import { NextResponse, type NextRequest } from "next/server";

import { signOutEverywhere, viewerSessionCookieName } from "@opendocs/shared/custom-domains/bridge";

import { getSiteContext } from "@/lib/site-context";
import { isCustomSite } from "@/lib/site-paths";

export const dynamic = "force-dynamic";

/**
 * POST /_opendocs/sign-out on a custom domain: signs the reader out of
 * OpenDocs, on this domain and on opendocs.cc (the session the domain
 * sign-in came from; every custom domain's sign-in ends with it). Signing
 * out of the domain alone looked broken: a private workspace's next page
 * sent members through the bridge and, still signed in on opendocs.cc,
 * straight back in. Lands on /_opendocs/signed-out.
 */
export async function POST(request: NextRequest) {
  const site = await getSiteContext();
  if (!isCustomSite(site)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Only from our own pages: the account menu's form posts same-origin.
  const origin = request.headers.get("origin");
  if (origin && origin !== site.origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const secure = site.origin.startsWith("https://");
  const cookie = viewerSessionCookieName(secure);
  await signOutEverywhere(request.cookies.get(cookie)?.value);
  const response = NextResponse.redirect(new URL("/_opendocs/signed-out", site.origin), 303);
  response.cookies.set(cookie, "", { path: "/", secure, maxAge: 0 });
  // The unprefixed name used before the `__Host-` cookies.
  if (secure) response.cookies.set(viewerSessionCookieName(false), "", { path: "/", maxAge: 0 });
  response.headers.set("cache-control", "no-store");
  return response;
}
