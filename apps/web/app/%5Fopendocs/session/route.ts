import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import {
  BRIDGE_STATE_TTL_SECONDS,
  SIGN_IN_CHECK_TTL_SECONDS,
  bridgeStateCookieName,
  exchangeBridgeCode,
  newBridgeSecret,
  signInCheckedCookieName,
  viewerSessionCookieName,
} from "@opendocs/shared/custom-domains/bridge";
import { safeReturnPath } from "@opendocs/shared/custom-domains/urls";

import { plainHtmlPage } from "@/lib/plain-page";
import { fullPageLoadResponse, isRouterFetch } from "@/lib/router-fetch";
import { clientAddress, isRateLimited } from "@/lib/request-limit";
import { getSiteContext } from "@/lib/site-context";
import { customSignInHref, isCustomSite } from "@/lib/site-paths";

export const dynamic = "force-dynamic";

// The folder is `%5Fopendocs` because Next treats folders starting with an
// underscore as private; this serves /_opendocs/session.

function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * /_opendocs/session on a custom domain (custom-domains/bridge.ts):
 *
 *   - without `code` (step 1): remember a random `state` in a host-only
 *     cookie and send the reader to opendocs.cc/auth/bridge to sign in
 *     (`prompt=none` passes on: only check, never show a sign-in page);
 *   - with `code` and `state` (step 3): check the state against that
 *     cookie, trade the one-time code for a viewer session and set it as a
 *     host-only cookie (`__Host-`, HttpOnly, Secure, SameSite=Lax, 7 days);
 *   - with `error=login_required` and `state`: the quiet check found
 *     nobody to sign in. Remember that for half an hour, so private pages
 *     show "Sign in" instead of checking again, and go back to the page.
 */
export async function GET(request: NextRequest) {
  const site = await getSiteContext();
  if (!isCustomSite(site)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (isRouterFetch(request)) return fullPageLoadResponse();
  if (isRateLimited(`custom-session:${clientAddress(request)}`, 60, 10 * 60 * 1000)) {
    return plainHtmlPage({
      title: "Too many sign-in attempts",
      message: "Wait a few minutes and try again.",
      links: [{ href: "/", label: `Back to ${site.workspaceName}` }],
      status: 429,
    });
  }

  // Plain http only for local test domains (notes.localhost).
  const secure = site.origin.startsWith("https://");
  const stateCookie = bridgeStateCookieName(secure);
  const checkedCookie = signInCheckedCookieName(secure);
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state") ?? "";
  const expectedState = request.cookies.get(stateCookie)?.value ?? "";
  const stateMatches = Boolean(state && expectedState && sameSecret(state, expectedState));

  if (params.get("error") === "login_required") {
    const returnPath = safeReturnPath(params.get("return") ?? "/") ?? "/";
    if (!stateMatches) {
      // No state cookie to match (cookies blocked, another browser):
      // going back would only start the check again, so stop here.
      return plainHtmlPage({
        title: "Sign in to continue",
        message: `This page on ${site.hostname} is private.`,
        links: [
          { href: customSignInHref(returnPath), label: "Sign in" },
          { href: "/", label: `Back to ${site.workspaceName}` },
        ],
      });
    }
    const response = NextResponse.redirect(new URL(returnPath, site.origin), 303);
    response.cookies.set(checkedCookie, "1", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: SIGN_IN_CHECK_TTL_SECONDS,
    });
    response.cookies.set(stateCookie, "", { path: "/", secure, maxAge: 0 });
    response.headers.set("cache-control", "no-store");
    return response;
  }

  if (!code) {
    const returnPath = safeReturnPath(params.get("return") ?? "/") ?? "/";
    const newState = newBridgeSecret();
    const bridge = new URL("/auth/bridge", site.opendocsOrigin);
    bridge.searchParams.set("host", site.hostname);
    bridge.searchParams.set("return", returnPath);
    bridge.searchParams.set("state", newState);
    if (params.get("prompt") === "none") bridge.searchParams.set("prompt", "none");
    const response = NextResponse.redirect(bridge, 302);
    response.cookies.set(stateCookie, newState, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: BRIDGE_STATE_TTL_SECONDS,
    });
    response.headers.set("cache-control", "no-store");
    return response;
  }

  const failure = (message: string) => {
    const response = plainHtmlPage({
      title: "Sign-in didn't finish",
      message,
      links: [{ href: "/", label: `Back to ${site.workspaceName}` }],
      status: 400,
    });
    return response;
  };
  if (!stateMatches) {
    return failure("This sign-in link was started in another browser or has expired. Open the document again to sign in.");
  }

  const result = await exchangeBridgeCode({ code, state, hostname: site.hostname });
  if ("error" in result) {
    return failure(
      result.error === "session_ended"
        ? "Your OpenDocs session ended before sign-in finished. Open the document again to sign in."
        : "This sign-in link has expired or was already used. Open the document again to sign in.",
    );
  }

  const response = NextResponse.redirect(new URL(result.returnPath, site.origin), 303);
  response.cookies.set(viewerSessionCookieName(secure), result.token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: result.expiresAt,
  });
  response.cookies.set(stateCookie, "", { path: "/", secure, maxAge: 0 });
  response.cookies.set(checkedCookie, "", { path: "/", secure, maxAge: 0 });
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}
