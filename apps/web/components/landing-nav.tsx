import { getFounderOfferView } from "@/lib/billing/founder-offer";

import { LandingNavBar, type LandingNavProps } from "./landing-nav-bar";

/**
 * The marketing nav. Reads the founding-member offer on the server, per
 * request, so its banner sits above the nav only while the offer is open.
 */
export async function LandingNav(props: LandingNavProps) {
  const founderOffer = await getFounderOfferView();
  return <LandingNavBar {...props} founderOffer={founderOffer} />;
}
