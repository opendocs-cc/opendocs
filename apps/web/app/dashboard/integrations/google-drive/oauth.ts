import { webAppUrl } from "@opendocs/shared/integrations/service";

/** Holds the OAuth state and workspace between /connect and /callback. */
export const OAUTH_COOKIE = "od_gdrive_oauth";
export const OAUTH_COOKIE_PATH = "/dashboard/integrations/google-drive";

export function driveRedirectUri(): string {
  return `${webAppUrl()}/dashboard/integrations/google-drive/callback`;
}
