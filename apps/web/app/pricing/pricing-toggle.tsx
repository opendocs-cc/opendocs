"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";

import {
  FOUNDER_PRO_PRICES,
  PRO_PRICES,
  formatOfferEnd,
  useFounderOfferOpen,
  type FounderOfferView,
} from "@/lib/billing/founder-offer-display";
import { PLAN_PRICES, perMonth } from "@/lib/plan-prices";

const { pro, team } = PLAN_PRICES;
const proYearlySaving = pro.monthly * 12 - pro.yearly;

export function PricingToggle({
  founderOffer,
}: {
  /** The open founding-member offer, from the server. */
  founderOffer: FounderOfferView | null;
}) {
  const [yearly, setYearly] = useState(false);
  const offerOpen = useFounderOfferOpen(founderOffer);

  const proPrice = yearly ? `$${perMonth(pro.yearly)}` : `$${pro.monthly}`;
  const proSubtext = yearly
    ? `$${pro.yearly}/year — save $${proYearlySaving}`
    : `or $${pro.yearly}/year (save ${Math.round((proYearlySaving / (pro.monthly * 12)) * 100)}%)`;

  // While the founding-member offer is open, Pro shows the price people
  // actually pay at checkout: the full billing-cycle amount, half off.
  const cycle = yearly ? "yearly" : "monthly";
  const founderPrice = `$${FOUNDER_PRO_PRICES[cycle]}`;
  const regularPrice = `$${PRO_PRICES[cycle]}`;

  const teamPrice = yearly ? `$${perMonth(team.yearlyPerSeat)}` : `$${team.monthlyPerSeat}`;
  const teamMinimum = yearly
    ? `${team.minSeats} seats minimum · from $${team.yearlyPerSeat * team.minSeats}/year`
    : `${team.minSeats} seats minimum · from $${team.monthlyPerSeat * team.minSeats}/month`;

  return (
    <>
      {/* Billing toggle */}
      <div className="pricing-toggle">
        <button
          className={`pricing-toggle__btn ${!yearly ? "pricing-toggle__btn--active" : ""}`}
          onClick={() => setYearly(false)}
        >
          Monthly
        </button>
        <button
          className={`pricing-toggle__btn ${yearly ? "pricing-toggle__btn--active" : ""}`}
          onClick={() => setYearly(true)}
        >
          Yearly
          <span className="pricing-toggle__save">Save 25%</span>
        </button>
      </div>

      {/* Plan cards */}
      <section className="pricing-cards lp-section">
        <div className="pricing-cards__grid">
          {/* Free */}
          <div className="pricing-card">
            <div className="pricing-card__header">
              <span className="pricing-card__name">Free</span>
              <div className="pricing-card__price">
                <span className="pricing-card__amount">$0</span>
                <span className="pricing-card__period">forever</span>
              </div>
              <p className="pricing-card__desc">
                Everything you need to try the full workflow. Publish, export
                with your own branding, and share — with an OpenDocs footer.
              </p>
            </div>
            <ul className="pricing-card__features">
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                50 published documents
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                1 workspace, 3 members
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                Public publishing
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                PDF export (with OpenDocs footer)
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                Export branding (logo, colors, fonts)
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                API keys &amp; CLI access
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                Version history
              </li>
              <li className="pricing-card__feature--muted">
                <X
                  size={16}
                  className="pricing-card__icon pricing-card__icon--x"
                />
                Word (.docx) export
              </li>
              <li className="pricing-card__feature--muted">
                <X
                  size={16}
                  className="pricing-card__icon pricing-card__icon--x"
                />
                Custom export footer
              </li>
            </ul>
            <Link
              href="/signup"
              className="pricing-card__cta pricing-card__cta--secondary"
            >
              Get started free
            </Link>
          </div>

          {/* Pro */}
          <div className="pricing-card pricing-card--featured">
            <div className="pricing-card__badge">Most popular</div>
            <div className="pricing-card__header">
              <span className="pricing-card__name">Pro</span>
              {offerOpen && founderOffer ? (
                <>
                  <div className="pricing-card__price">
                    <span className="pricing-card__amount">{founderPrice}</span>
                    <s className="pricing-card__was">
                      <span className="sr-only">Regular price </span>
                      {regularPrice}
                    </s>
                    <span className="pricing-card__period">
                      {yearly ? "/year" : "/month"}
                    </span>
                  </div>
                  <p className="pricing-card__yearly">
                    Founding-member price, locked in while you stay
                    subscribed
                  </p>
                  <p className="pricing-card__offer-end">
                    Subscribe by {formatOfferEnd(founderOffer.endsAt)} to lock
                    it in.
                  </p>
                </>
              ) : (
                <>
                  <div className="pricing-card__price">
                    <span className="pricing-card__amount">{proPrice}</span>
                    <span className="pricing-card__period">/month</span>
                  </div>
                  <p className="pricing-card__yearly">{proSubtext}</p>
                </>
              )}
              <p className="pricing-card__desc">
                Unlimited documents, Word exports, your own export footer and
                your own domain, for solo creators and small teams up to 5.
              </p>
            </div>
            <ul className="pricing-card__features">
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                <strong>Unlimited</strong> documents
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                2 workspaces, up to 5 members each
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                PDF &amp; Word export, unlimited
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                Your own export footer, no &quot;Made with OpenDocs&quot;
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                Your own domain, like notes.yourcompany.com
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                API keys &amp; CLI access
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                Version history
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                Email support
              </li>
            </ul>
            <Link
              href="/signup"
              className="pricing-card__cta pricing-card__cta--primary"
            >
              Start with Pro
            </Link>
          </div>

          {/* Team */}
          <div className="pricing-card">
            <div className="pricing-card__header">
              <span className="pricing-card__name">Team</span>
              <div className="pricing-card__price">
                <span className="pricing-card__amount">{teamPrice}</span>
                <span className="pricing-card__period">/user/month</span>
              </div>
              <p className="pricing-card__yearly">{teamMinimum}</p>
              <p className="pricing-card__desc">
                For growing teams that need unlimited workspaces, unlimited
                members, and priority support.
              </p>
            </div>
            <ul className="pricing-card__features">
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                Everything in Pro
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                <strong>Unlimited</strong> workspaces &amp; members
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                A custom domain for each workspace
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                One bill for the whole team: seats follow who you invite
              </li>
              <li>
                <Check
                  size={16}
                  className="pricing-card__icon pricing-card__icon--check"
                />
                Priority support
              </li>
            </ul>
            <Link
              href="/signup"
              className="pricing-card__cta pricing-card__cta--secondary"
            >
              Start with Team
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
