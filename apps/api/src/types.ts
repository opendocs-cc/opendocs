import type { Request } from "express";

import type { OAuthGrant } from "./auth/oauth-token";

export interface AuthenticatedRequest extends Request {
  userId: string;
  authMethod: "session" | "api_key" | "oauth";
  /** Set for OAuth (MCP) callers: the client, granted scopes and connection. */
  oauth?: OAuthGrant;
}

/** Set by `clientAttribution` from the X-OpenDocs-Client header. */
export interface ClientAwareRequest extends Request {
  openDocsClient?: string | null;
}
