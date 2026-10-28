import { NextResponse } from "next/server";

import {
  EXTENSION_CLIENT_METADATA_PATH,
  EXTENSION_SCOPES,
  extensionRedirectUris,
} from "@opendocs/shared/extension/config";

export const dynamic = "force-dynamic";

/**
 * Client ID Metadata Document for the OpenDocs browser extension. Its URL
 * is the extension's OAuth client_id: Better Auth fetches this file when the
 * extension starts a sign-in, so adding a store's extension ID (EXTENSION_IDS)
 * adds its redirect URL without registering anything. Sign-in still goes
 * through the consent page, which creates the connection the API checks.
 */
export function GET() {
  const base = (process.env.BETTER_AUTH_URL ?? "https://opendocs.cc").replace(/\/+$/, "");
  return NextResponse.json(
    {
      client_id: `${base}${EXTENSION_CLIENT_METADATA_PATH}`,
      client_name: "OpenDocs extension",
      client_uri: `${base}/extension`,
      logo_uri: `${base}/favicon.png`,
      redirect_uris: extensionRedirectUris(),
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: EXTENSION_SCOPES.join(" "),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
