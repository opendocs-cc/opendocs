import { cache } from "react";
import { headers } from "next/headers";

import { openDocsWebUrl } from "@opendocs/shared/custom-domains/urls";

import { parseSiteContext, SITE_HEADER, type SiteContext } from "./site-paths";

/**
 * The site this request is for. The middleware (apps/web/middleware.ts)
 * strips any `x-opendocs-site` header a client sends and sets its own only
 * for active custom domains, so the header can be trusted here.
 */
export const getSiteContext = cache(async (): Promise<SiteContext> => {
  const site = parseSiteContext((await headers()).get(SITE_HEADER));
  return site ?? { kind: "opendocs", opendocsOrigin: openDocsWebUrl() };
});
