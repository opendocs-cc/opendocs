import { NextResponse, type NextRequest } from "next/server";

import { createBridgeCode, isValidBridgeState } from "@opendocs/shared/custom-domains/bridge";
import { normalizeHostHeader } from "@opendocs/shared/custom-domains/hostname";
import { lookupCustomHost, type CustomHostSite } from "@opendocs/shared/custom-domains/service";
import { openDocsWebUrl, safeReturnPath } from "@opendocs/shared/custom-domains/urls";

import { plainHtmlPage } from "@/lib/plain-page";
import { clientAddress, isRateLimited } from "@/lib/request-limit";
import { getSiteContext } from "@/lib/site-context";
import { isCustomSite } from "@/lib/site-paths";

/**
 * The opendocs.cc side of signing in on a custom domain (app/auth/bridge
 * and app/auth/bridge/switch; the custom domain's side is
 * app/%5Fopendocs/session, the flow is in custom-domains/bridge.ts).
 */

export type BridgeParams = {
  hostname: string;
  state: string;
  returnPath: string;
  /** `prompt=none`: a quiet check that never shows a sign-in page. */
  quiet: boolean;
  site: CustomHostSite;
};

/**
 * Checks every bridge request shares: not on a custom domain, not rate
 * limited, a valid state and relative return path, and `host` an active,
 * serving custom domain. Returns the error page to send, or the values.
 */
export async function checkBridgeRequest(
  request: NextRequest,
  params: { get(name: string): string | null },
): Promise<Response | BridgeParams> {
  if (isCustomSite(await getSiteContext())) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (isRateLimited(`bridge:${clientAddress(request)}`, 60, 10 * 60 * 1000)) {
    return plainHtmlPage({
      title: "Too many sign-in attempts",
      message: "Wait a few minutes and try again.",
      status: 429,
    });
  }

  const hostname = normalizeHostHeader(params.get("host"));
  const state = params.get("state");
  const returnPath = safeReturnPath(params.get("return") ?? "/");
  if (!hostname || !isValidBridgeState(state) || !returnPath) {
    return plainHtmlPage({
      title: "This sign-in link isn't valid",
      message: "Go back to the page you were reading and sign in from there.",
      links: [{ href: "/", label: "Go to OpenDocs" }],
      status: 400,
    });
  }

  // Before asking anyone to sign in: only active, serving custom domains.
  const site = await lookupCustomHost(hostname, { fresh: true });
  if (!site?.serving) return notConnected(hostname);
  return { hostname, state, returnPath, quiet: params.get("prompt") === "none", site };
}

export function notConnected(hostname: string) {
  return plainHtmlPage({
    title: "This domain isn't connected to OpenDocs",
    message: `${hostname} isn't an active custom domain, so we can't sign you in there.`,
    links: [{ href: "/dashboard", label: "Go to your dashboard" }],
    status: 400,
  });
}

/** This bridge request as a path on opendocs.cc, without `prompt=none`. */
export function bridgePath(bridge: BridgeParams) {
  const url = new URL("/auth/bridge", openDocsWebUrl());
  url.searchParams.set("host", bridge.hostname);
  url.searchParams.set("return", bridge.returnPath);
  url.searchParams.set("state", bridge.state);
  return `${url.pathname}${url.search}`;
}

export function signInFirst(bridge: BridgeParams) {
  return NextResponse.redirect(
    `${openDocsWebUrl()}/login?redirect=${encodeURIComponent(bridgePath(bridge))}`,
    303,
  );
}

/**
 * The quiet check's "no": back to the custom domain with nothing about the
 * reader, where private pages then offer "Sign in" instead of sending them
 * here again. The same for nobody signed in and for signed-in readers who
 * aren't members (who they are stays on opendocs.cc).
 */
export function backWithoutSignIn(bridge: BridgeParams) {
  const target = new URL("/_opendocs/session", bridge.site.origin);
  target.searchParams.set("error", "login_required");
  target.searchParams.set("state", bridge.state);
  target.searchParams.set("return", bridge.returnPath);
  const response = NextResponse.redirect(target, 303);
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

/** Mints the one-time code and sends the reader back to the custom domain. */
export async function handOff(
  bridge: BridgeParams,
  session: { user: { id: string }; session: { id: string } },
) {
  const result = await createBridgeCode({
    userId: session.user.id,
    sessionId: session.session.id,
    hostname: bridge.hostname,
    state: bridge.state,
    returnPath: bridge.returnPath,
  });
  if ("error" in result) return notConnected(bridge.hostname);

  const target = new URL("/_opendocs/session", result.origin);
  target.searchParams.set("code", result.code);
  target.searchParams.set("state", bridge.state);
  const response = NextResponse.redirect(target, 303);
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

/**
 * A signed-in reader who isn't a member and has nothing shared with them in
 * the domain's workspace: they stop here, and the domain never sees them.
 * "Use another account" signs out of OpenDocs and back in (app/auth/bridge/switch).
 */
export function noAccess(bridge: BridgeParams, email: string) {
  return plainHtmlPage({
    title: `This account doesn't have access to ${bridge.hostname}`,
    message: `You're signed in to OpenDocs as ${email}, and nothing on ${bridge.hostname} is shared with this account. If you were sent an invitation or a document, sign in with the email address it went to.`,
    form: {
      action: "/auth/bridge/switch",
      fields: { host: bridge.hostname, return: bridge.returnPath, state: bridge.state },
      submitLabel: "Use another account",
    },
    links: [{ href: "/dashboard", label: "Go to your dashboard" }],
  });
}
