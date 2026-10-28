import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getServerSession } from "@/lib/auth/session";
import { MCP_SCOPES, parseScopes } from "@opendocs/shared/mcp/config";
import {
  describeOAuthClient,
  getOAuthClientRecord,
  upsertConnectionOnConsent,
} from "@opendocs/shared/mcp/connections";

export const dynamic = "force-dynamic";

const consentSchema = z.object({
  oauthQuery: z.string().min(1).max(8192),
  accept: z.boolean(),
  workspaceId: z.string().min(1),
  scopes: z.array(z.string()).max(10),
});

/**
 * First half of approving an MCP client on /oauth/consent: records the
 * connection's default workspace and works out which scopes to grant (only
 * ones the client asked for; docs:read always; refresh tokens when asked).
 * The page then posts the decision to Better Auth's /oauth2/consent, which
 * checks the signed request and returns where to send the browser.
 */
export async function POST(req: NextRequest) {
  // Same-origin JSON only (the consent page's own fetch).
  const origin = req.headers.get("origin");
  const expectedOrigin = new URL(process.env.BETTER_AUTH_URL ?? req.nextUrl.origin).origin;
  if (origin !== expectedOrigin || !req.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "forbidden", message: "Invalid request." }, { status: 403 });
  }

  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized", message: "Your session ended. Go back to the app and connect again." },
      { status: 401 },
    );
  }

  const parsed = consentSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", message: "Invalid consent request." }, { status: 400 });
  }
  const { oauthQuery, accept, workspaceId } = parsed.data;
  const query = new URLSearchParams(oauthQuery);
  const clientId = query.get("client_id") ?? "";

  // Grant only scopes the client asked for (Better Auth refuses anything
  // else): docs:read whenever it was requested, refresh tokens when
  // requested. Without a scope parameter the client gets its defaults and
  // no scope is sent; a denial never needs one.
  const requested = parseScopes(query.get("scope"));
  let scope: string | null = null;
  if (accept && requested.size > 0) {
    const granted = new Set<string>(
      parsed.data.scopes.filter((s) => (MCP_SCOPES as string[]).includes(s) && requested.has(s)),
    );
    if (requested.has("docs:read")) granted.add("docs:read");
    if (requested.has("offline_access")) granted.add("offline_access");
    if (granted.size === 0) {
      return NextResponse.json(
        { error: "invalid_scope", message: "Choose at least one permission, or cancel." },
        { status: 400 },
      );
    }
    scope = [...granted].join(" ");
  }

  if (accept) {
    const client = await getOAuthClientRecord(clientId);
    if (!client) {
      return NextResponse.json(
        { error: "invalid_client", message: "We don't recognise this app. Go back and connect again." },
        { status: 400 },
      );
    }
    const connection = await upsertConnectionOnConsent({
      userId: session.user.id,
      clientId,
      clientName: describeOAuthClient(client, query.get("redirect_uri")).name,
      workspaceId,
    });
    if ("error" in connection) {
      return NextResponse.json(
        { error: "forbidden", message: "You're not a member of that workspace." },
        { status: 403 },
      );
    }
  }

  // Better Auth's /oauth2/consent completes the authorization; the browser
  // calls it next (it needs the browser's own request), with these scopes.
  return NextResponse.json({ scope });
}
