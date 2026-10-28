"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { SiteContext } from "@/lib/site-paths";

const SiteContextValue = createContext<SiteContext | null>(null);

/**
 * Hands the request's site (opendocs.cc or a custom domain) to client
 * components on reader pages; mounted by app/[workspace]/layout.tsx.
 */
export function SiteProvider({ site, children }: { site: SiteContext; children: ReactNode }) {
  return <SiteContextValue.Provider value={site}>{children}</SiteContextValue.Provider>;
}

/** Null outside reader pages, which means opendocs.cc. */
export function useSite(): SiteContext | null {
  return useContext(SiteContextValue);
}
