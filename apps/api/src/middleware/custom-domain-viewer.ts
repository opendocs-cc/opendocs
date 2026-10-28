import type { NextFunction, Request, Response } from "express";

import { getViewerSession } from "@opendocs/shared/custom-domains/bridge";
import { normalizeHostHeader } from "@opendocs/shared/custom-domains/hostname";
import { lookupCustomHost } from "@opendocs/shared/custom-domains/service";

/** Who is downloading through a custom domain, and for which workspace. */
export type CustomDomainViewer = { userId: string; workspaceId: string; hostname: string };

export interface CustomDomainViewerRequest extends Request {
  customDomainViewer?: CustomDomainViewer;
}

export const VIEWER_SESSION_HEADER = "x-opendocs-viewer-session";
export const VIEWER_HOST_HEADER = "x-opendocs-viewer-host";

/**
 * Downloads from a custom domain (notes.example.com). A reader's sign-in
 * there is a host-only viewer session (custom-domains/bridge.ts) that the
 * browser can't send to the API, so the web app's /_opendocs/download
 * route forwards it in two headers: the session token and the domain. The
 * token is checked here like any other credential, and it only unlocks
 * documents of that domain's workspace: routes compare
 * `customDomainViewer.workspaceId` with the document's. Missing or invalid
 * headers leave the request anonymous, so public documents still download.
 */
export async function customDomainViewerAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.header(VIEWER_SESSION_HEADER);
  const hostname = normalizeHostHeader(req.header(VIEWER_HOST_HEADER) ?? "");
  if (!token || !hostname) {
    next();
    return;
  }
  try {
    const [viewer, site] = await Promise.all([getViewerSession(token, hostname), lookupCustomHost(hostname)]);
    if (viewer && site?.serving) {
      (req as CustomDomainViewerRequest).customDomainViewer = {
        userId: viewer.user.id,
        workspaceId: site.workspaceId,
        hostname,
      };
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function getCustomDomainViewer(req: Request): CustomDomainViewer | null {
  return (req as CustomDomainViewerRequest).customDomainViewer ?? null;
}
