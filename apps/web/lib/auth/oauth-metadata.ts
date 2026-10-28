import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";

import { getSiteContext } from "@/lib/site-context";
import { isCustomSite } from "@/lib/site-paths";

/**
 * RFC 8414 authorization server metadata for the MCP OAuth server. The
 * issuer is `<origin>/api/auth`, so MCP clients look for it at the
 * path-inserted location (/.well-known/oauth-authorization-server/api/auth);
 * the root location is served too for clients that skip path insertion.
 * Only on opendocs.cc, never on a workspace's custom domain.
 */
export async function authorizationServerMetadata(request: Request): Promise<Response> {
  if (isCustomSite(await getSiteContext())) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const { auth } = await import("@/lib/auth");
  return oauthProviderAuthServerMetadata(auth, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" },
  })(request);
}
