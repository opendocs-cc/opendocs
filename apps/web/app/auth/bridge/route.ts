import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { isActiveWorkspaceMember } from "@opendocs/shared/custom-domains/bridge";
import { openDocsWebUrl } from "@opendocs/shared/custom-domains/urls";
import { hasDocumentsSharedInWorkspace } from "@opendocs/shared/posts/sharing";

import { auth } from "@/lib/auth";
import {
  backWithoutSignIn,
  checkBridgeRequest,
  handOff,
  noAccess,
  signInFirst,
} from "@/lib/custom-domain-bridge";
import { plainHtmlPage } from "@/lib/plain-page";
import { fullPageLoadResponse, isRouterFetch } from "@/lib/router-fetch";

export const dynamic = "force-dynamic";

/**
 * GET /auth/bridge?host=notes.example.com&return=/plan&state=…[&prompt=none]
 *
 * Step 2 of signing in on a custom domain (custom-domains/bridge.ts): the
 * reader is on opendocs.cc and is sent back to the custom domain with a
 * one-time code. `host` must be an active custom domain and `return` a
 * relative path, so this can't be used to redirect anywhere else.
 *
 *   - Members of the domain's workspace go straight back.
 *   - Other signed-in readers with something shared with them in that
 *     workspace confirm first ("Continue to notes.example.com as you@…"),
 *     because the domain's owner would learn their name and email.
 *   - Signed-in readers with nothing to read there stop here (noAccess).
 *   - Nobody signed in: the sign-in page.
 *
 * With `prompt=none` (the quiet check a private page starts on its own)
 * everyone but members goes straight back to the domain, which then offers
 * "Sign in", so strangers are never pushed into signing up.
 */
export async function GET(request: NextRequest) {
  if (isRouterFetch(request)) return fullPageLoadResponse();
  const bridge = await checkBridgeRequest(request, request.nextUrl.searchParams);
  if (bridge instanceof Response) return bridge;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return bridge.quiet ? backWithoutSignIn(bridge) : signInFirst(bridge);

  if (await isActiveWorkspaceMember(session.user.id, bridge.site.workspaceId)) {
    return handOff(bridge, session);
  }
  // The quiet check never shows a page, and answers non-members the same
  // way as nobody signed in, so the domain can't tell them apart.
  if (bridge.quiet) return backWithoutSignIn(bridge);
  if (!(await hasDocumentsSharedInWorkspace(session.user.id, bridge.site.workspaceId))) {
    return noAccess(bridge, session.user.email);
  }

  return plainHtmlPage({
    title: `Continue to ${bridge.hostname}?`,
    message: `${bridge.hostname} is ${bridge.site.workspaceName}'s site on OpenDocs. Continuing signs you in there as ${session.user.email}, and ${bridge.site.workspaceName} will be able to see your name, email address and profile picture.`,
    form: {
      action: "/auth/bridge",
      fields: { host: bridge.hostname, return: bridge.returnPath, state: bridge.state },
      submitLabel: `Continue as ${session.user.email}`,
    },
    links: [{ href: "/dashboard", label: "Cancel" }],
  });
}

/**
 * POST /auth/bridge: the confirmation form above. Only from our own page
 * (the Origin check; the session cookie is SameSite=Lax, so another site's
 * form wouldn't carry it either).
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

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return signInFirst(bridge);
  const member = await isActiveWorkspaceMember(session.user.id, bridge.site.workspaceId);
  if (!member && !(await hasDocumentsSharedInWorkspace(session.user.id, bridge.site.workspaceId))) {
    return noAccess(bridge, session.user.email);
  }
  return handOff(bridge, session);
}
