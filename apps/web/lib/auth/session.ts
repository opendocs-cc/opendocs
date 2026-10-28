import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getViewerSession, viewerSessionCookieName } from "@opendocs/shared/custom-domains/bridge";

import { getSiteContext } from "@/lib/site-context";
import { isCustomSite } from "@/lib/site-paths";

import { auth } from "./index";

/**
 * The opendocs.cc session. Always null on custom domains: the OpenDocs
 * session cookie is never valid there, so nothing that needs a real
 * session (dashboard, server actions, settings) can run on one. Reader
 * pages and comments use getReaderSession instead.
 */
export const getServerSession = cache(async () => {
  if (isCustomSite(await getSiteContext())) return null;
  return auth.api.getSession({
    headers: await headers(),
  });
});

export async function requireServerSession() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export type ReaderSession = {
  /** "viewer" is a custom-domain sign-in: it can read and comment, nothing else. */
  kind: "opendocs" | "viewer";
  user: { id: string; name: string; email: string; image?: string | null };
};

/**
 * Who is reading: the opendocs.cc session on opendocs.cc, the host-only
 * viewer session (sign-in bridge) on a custom domain.
 */
export const getReaderSession = cache(async (): Promise<ReaderSession | null> => {
  const site = await getSiteContext();
  if (isCustomSite(site)) {
    const token = (await cookies()).get(viewerSessionCookieName(site.origin.startsWith("https://")))?.value;
    if (!token) return null;
    const viewer = await getViewerSession(token, site.hostname);
    return viewer ? { kind: "viewer", user: viewer.user } : null;
  }
  const session = await getServerSession();
  return session ? { kind: "opendocs", user: session.user } : null;
});
