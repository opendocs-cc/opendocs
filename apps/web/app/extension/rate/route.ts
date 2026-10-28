import { NextResponse, type NextRequest } from "next/server";

import { EXTENSION_PAGE_URL, extensionStoreLinks } from "@/lib/extension";

export const dynamic = "force-dynamic";

/**
 * `/extension/rate?store=chrome|edge`: the extension's "Rate it" link. It
 * goes to the store listing's reviews, so the extension doesn't need an
 * update when a listing's URL changes, and to /extension until the listing
 * is public.
 */
export function GET(request: NextRequest) {
  const links = extensionStoreLinks();
  const edge = request.nextUrl.searchParams.get("store") === "edge";
  const listing = edge ? links.edge : links.chrome;
  if (!listing) return NextResponse.redirect(EXTENSION_PAGE_URL, 302);

  const target = new URL(listing);
  // The Chrome Web Store has a reviews page; Edge shows reviews on the listing.
  if (!edge) target.pathname = `${target.pathname.replace(/\/+$/, "")}/reviews`;
  return NextResponse.redirect(target, 302);
}
