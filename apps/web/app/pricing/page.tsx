import Link from "next/link";
import { Check, X } from "lucide-react";

import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { getServerSession } from "@/lib/auth/session";
import { getFounderOfferView } from "@/lib/billing/founder-offer";
import { buildPageMetadata } from "@/lib/metadata";
import { FounderOfferFaqItem } from "./founder-offer-faq";
import { PricingToggle } from "./pricing-toggle";

import "../landing.css";
import "./pricing.css";

export const metadata = buildPageMetadata({
  title: "Pricing",
  description:
    "Start free, with your own export branding. Upgrade when you need unlimited documents, Word exports, your own export footer, your own domain, or team features. Transparent per-user pricing with no surprises.",
  url: "https://opendocs.cc/pricing",
});

const faq = [
  {
    q: "What happens when I hit the 50-document limit on Free?",
    a: "Your existing documents stay published and accessible. You just won't be able to publish new ones until you unpublish one or upgrade to Pro.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel your subscription at any time from the dashboard. You'll keep paid features until the end of your billing period, then your account reverts to Free.",
  },
  {
    q: "Is the API included on the Free plan?",
    a: "Yes. API keys and CLI access are included on every plan, Free included. We built OpenDocs for AI-tool power users, so gating the API would go against that.",
  },
  {
    q: "What's the difference between PDF export on Free and Pro?",
    a: "Free users can export an unlimited number of PDFs with their own logo, brand color, font and branding presets, but every exported PDF carries a small \"Made with OpenDocs — opendocs.cc\" footer. Pro replaces that footer with your own (or none) and adds Word (.docx) export.",
  },
  {
    q: "Can documents live on my own domain?",
    a: "Yes, on Pro and Team. Each workspace can connect a subdomain such as notes.yourcompany.com: add two DNS records (or have your AI agent add them) and its documents, projects and workspace page are served there over HTTPS, white-label if you like, and opendocs.cc links redirect to it.",
  },
  {
    q: "Why does Team have a 3-seat minimum?",
    a: "Team is for real teams: unlimited workspaces, unlimited members, and priority support. A 3-seat minimum ($12/month) keeps Team genuinely more expensive than Pro's $8 flat rate, so Team is the plan you choose for collaboration, not as a cheaper Pro.",
  },
  {
    q: "Can a Team plan add or remove seats anytime?",
    a: "Yes. Add seats as you grow; billing is prorated. You can remove seats at renewal; the plan enforces the 3-seat minimum.",
  },
  {
    q: "Are there rate limits?",
    a: "Yes, the same on every plan, and sized for real work: each account can publish 120 documents and export 120 a minute, more through batches. A real workflow, like re-exporting dozens of long documents after a round of AI edits, goes through in one run, and the CLI waits and retries on its own if it ever hits a limit.",
  },
  {
    q: "Can readers view public documents without an account?",
    a: "Yes. Anyone with the link can read a public document, on every plan. No sign-up, no login.",
  },
];

export default async function PricingPage() {
  const [session, founderOffer] = await Promise.all([
    getServerSession(),
    getFounderOfferView(),
  ]);

  return (
    <div className="lp">
      <LandingNav active="pricing" authenticated={Boolean(session)} />

      <main className="lp-main">
        {/* Hero */}
        <section className="pricing-hero lp-section">
          <h1 className="pricing-hero__title">
            Simple, transparent pricing
          </h1>
          <p className="pricing-hero__subtitle">
            Start free, with your own export branding. Upgrade when you need
            unlimited documents, Word exports, your own domain, or team
            features.
          </p>

          <PricingToggle founderOffer={founderOffer} />
        </section>

        {/* Comparison table */}
        <section className="pricing-compare lp-section">
          <h2 className="pricing-compare__title">Compare plans</h2>
          <div className="pricing-compare__table-wrap">
            <table className="pricing-compare__table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Free</th>
                  <th>Pro</th>
                  <th>Team</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Published documents</td>
                  <td>50</td>
                  <td>Unlimited</td>
                  <td>Unlimited</td>
                </tr>
                <tr>
                  <td>Workspaces</td>
                  <td>1</td>
                  <td>2</td>
                  <td>Unlimited</td>
                </tr>
                <tr>
                  <td>Members per workspace</td>
                  <td>3</td>
                  <td>Up to 5</td>
                  <td>Unlimited</td>
                </tr>
                <tr>
                  <td>Public publishing</td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                </tr>
                <tr>
                  <td>PDF export</td>
                  <td>With OpenDocs footer</td>
                  <td>No footer</td>
                  <td>No footer</td>
                </tr>
                <tr>
                  <td>Word (.docx) export</td>
                  <td><X size={16} className="pricing-compare__x" /></td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                </tr>
                <tr>
                  <td>Export branding (logo, colors, fonts, presets)</td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                </tr>
                <tr>
                  <td>Custom export footer</td>
                  <td><X size={16} className="pricing-compare__x" /></td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                </tr>
                <tr>
                  <td>Custom domain</td>
                  <td><X size={16} className="pricing-compare__x" /></td>
                  <td>1 per workspace</td>
                  <td>1 per workspace</td>
                </tr>
                <tr>
                  <td>API keys &amp; CLI</td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                </tr>
                <tr>
                  <td>Version history</td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                </tr>
                <tr>
                  <td>Roles (owner, admin, member)</td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                  <td><Check size={16} className="pricing-compare__check" /></td>
                </tr>
                <tr>
                  <td>Support</td>
                  <td>Community</td>
                  <td>Email</td>
                  <td>Priority</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="pricing-faq lp-section">
          <h2 className="pricing-faq__title">Frequently asked questions</h2>
          <div className="pricing-faq__grid">
            <FounderOfferFaqItem offer={founderOffer} />
            {faq.map((item) => (
              <div key={item.q} className="pricing-faq__item">
                <h3 className="pricing-faq__q">{item.q}</h3>
                <p className="pricing-faq__a">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="pricing-cta lp-section">
          <h2 className="pricing-cta__title">
            Start publishing for free
          </h2>
          <p className="pricing-cta__desc">
            No credit card required. Upgrade to Pro or Team whenever you&apos;re ready.
          </p>
          <Link href="/signup" className="lp-btn-gradient lp-btn-gradient--xl">
            Get started free
          </Link>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
