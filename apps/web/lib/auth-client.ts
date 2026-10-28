"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

export const authClient = createAuthClient({
  // oauthProviderClient: on pages inside an MCP/OAuth authorization flow
  // (the URL carries a signed `sig` query), sign-in requests forward that
  // query so the server can resume the authorization afterwards.
  plugins: [emailOTPClient(), oauthProviderClient()],
});
