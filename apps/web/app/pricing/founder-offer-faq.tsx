"use client";

import {
  FOUNDER_PRO_PRICES,
  PRO_PRICES,
  formatOfferEnd,
  useFounderOfferOpen,
  type FounderOfferView,
} from "@/lib/billing/founder-offer-display";

/** The founding-member question, first in the pricing FAQ while the offer is open. */
export function FounderOfferFaqItem({ offer }: { offer: FounderOfferView | null }) {
  const open = useFounderOfferOpen(offer);
  if (!open || !offer) return null;

  return (
    <div className="pricing-faq__item">
      <h3 className="pricing-faq__q">What is the founding-member price?</h3>
      <p className="pricing-faq__a">
        Subscribe to Pro by {formatOfferEnd(offer.endsAt)} and you pay $
        {FOUNDER_PRO_PRICES.monthly} a month or ${FOUNDER_PRO_PRICES.yearly} a
        year instead of ${PRO_PRICES.monthly} or ${PRO_PRICES.yearly}, for as
        long as that subscription stays active. Switching between monthly and
        yearly keeps it. If you cancel and subscribe again after the offer
        ends, it&apos;s the regular price. Team and extra Pro workspaces are
        always the regular price.
      </p>
    </div>
  );
}
