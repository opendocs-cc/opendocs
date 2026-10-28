import "server-only";

import { connection } from "next/server";

import { getActiveFounderOffer } from "@opendocs/shared/billing/founder-offer";

import type { FounderOfferView } from "./founder-offer-display";

/**
 * The open founder offer for this request, in the shape client components
 * take (just the deadline). Awaiting `connection()` keeps any page that
 * shows the offer rendered per request: a page prerendered at build time
 * would otherwise keep the banner and the $4 price after the deadline.
 */
export async function getFounderOfferView(): Promise<FounderOfferView | null> {
  await connection();
  const offer = getActiveFounderOffer();
  return offer ? { endsAt: offer.endsAt.toISOString() } : null;
}
