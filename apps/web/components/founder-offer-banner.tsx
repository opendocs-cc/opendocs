import Link from "next/link";

import {
  FOUNDER_PRO_PRICES,
  formatOfferEnd,
  type FounderOfferView,
} from "@/lib/billing/founder-offer-display";

/**
 * One-line strip above the marketing nav while the founding-member offer
 * is open. Fixed height (see .lp-offer-banner), so the copy shortens on
 * narrow screens instead of wrapping.
 */
export function FounderOfferBanner({
  offer,
  linkToPricing,
}: {
  offer: FounderOfferView;
  /** Off on /pricing itself. */
  linkToPricing: boolean;
}) {
  const monthly = `$${FOUNDER_PRO_PRICES.monthly}`;
  const text = (
    <>
      <span className="lp-offer-banner__text lp-offer-banner__text--long">
        Founding-member price: Pro for {monthly}/month, locked in while you
        stay subscribed. Ends {formatOfferEnd(offer.endsAt)}.
      </span>
      <span className="lp-offer-banner__text lp-offer-banner__text--medium">
        Founding-member price: Pro for {monthly}/month, locked in. Ends{" "}
        {formatOfferEnd(offer.endsAt)}.
      </span>
      <span className="lp-offer-banner__text lp-offer-banner__text--short">
        Founding-member price: Pro {monthly}/mo. Ends{" "}
        {formatOfferEnd(offer.endsAt, "short")}.
      </span>
    </>
  );

  if (!linkToPricing) {
    return <div className="lp-offer-banner">{text}</div>;
  }
  return (
    <Link href="/pricing" className="lp-offer-banner lp-offer-banner--link">
      {text}
      <span className="lp-offer-banner__cta">See pricing</span>
    </Link>
  );
}
