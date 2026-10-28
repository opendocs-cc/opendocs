import type { ReactNode } from "react";

import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";

/**
 * Wrapper used by the SEO marketing pages — converter sub-pages,
 * use-case pages, comparison pages, etc. Mounts the same nav +
 * footer as every other public surface so the chrome is consistent,
 * and gives the inner content a `mk-page` class for shared styling
 * (top padding under the navbar, max-width, etc.).
 *
 * Why a shell component (vs. duplicating the nav/footer plumbing
 * in every page): we add ~10 marketing pages in one go and this
 * keeps the call site short — each page is just
 * `<MarketingShell isViewerSignedIn={...}><Hero />…</MarketingShell>`.
 */
type MarketingShellProps = {
  isViewerSignedIn: boolean;
  children: ReactNode;
};

export function MarketingShell({
  isViewerSignedIn,
  children,
}: MarketingShellProps) {
  return (
    <>
      <LandingNav authenticated={isViewerSignedIn} />
      <main className="mk-page">{children}</main>
      <LandingFooter />
    </>
  );
}
