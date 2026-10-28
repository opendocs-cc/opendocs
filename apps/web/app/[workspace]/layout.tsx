import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { SiteProvider } from "@/components/site-provider";
import { getSiteContext } from "@/lib/site-context";
import { isCustomSite } from "@/lib/site-paths";

type WorkspaceLayoutProps = {
  children: ReactNode;
  params: Promise<{ workspace: string }>;
};

function decodeSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Reader pages. On a custom domain the middleware rewrites every path into
 * the connected workspace, so any other workspace here means someone
 * crafted the path; those pages only exist on opendocs.cc.
 */
export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const site = await getSiteContext();
  const { workspace } = await params;
  if (isCustomSite(site) && decodeSegment(workspace).toLowerCase() !== site.workspaceSlug) {
    notFound();
  }
  return <SiteProvider site={site}>{children}</SiteProvider>;
}
