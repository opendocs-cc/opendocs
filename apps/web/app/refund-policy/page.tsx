import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { endSentence, legalEntity, legalEntityWithRegistration } from "@/lib/legal-entity";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata = buildPageMetadata({
  title: "Refund Policy",
  description:
    "Our 14-day money-back guarantee and how refunds are handled for OpenDocs Pro and Team subscriptions.",
  url: "https://opendocs.cc/refund-policy",
});

// The operator's details come from the environment at request time.
export const dynamic = "force-dynamic";

export default function RefundPolicyPage() {
  const entity = legalEntity();
  return (
    <LegalPage
      document="refunds"
      title="Refund Policy"
      summary="Our 14-day money-back guarantee, how cancellations work, and how to ask for a refund on Pro and Team plans."
      effective="April 14, 2026"
    >
      <p>
        This Refund Policy applies to paid subscriptions purchased for OpenDocs, operated by{" "}
        {endSentence(legalEntityWithRegistration(entity))} All payments are
        processed by our Merchant of Record, Paddle, and refunds are issued through Paddle in
        accordance with this policy.
      </p>

      <LegalSection id="money-back-guarantee" title="14-Day Money-Back Guarantee">
        <p>
          1.1. If you are not satisfied with your paid subscription, you may request a full refund
          within 14 days of your initial purchase. No questions asked.
        </p>
        <p>
          1.2. This guarantee applies only to the first payment on a new subscription. It does not
          apply to renewal charges, plan upgrades, or subsequent billing cycles.
        </p>
      </LegalSection>

      <LegalSection id="cancellations" title="Cancellations">
        <p>
          2.1. You may cancel your subscription at any time from your account dashboard. Upon
          cancellation, your paid features will remain active until the end of your current billing
          period.
        </p>
        <p>
          2.2. Cancellations made after the 14-day money-back period are not eligible for a refund.
          You will retain access to paid features for the remainder of the billing period you have
          already paid for.
        </p>
      </LegalSection>

      <LegalSection id="annual-subscriptions" title="Annual Subscriptions">
        <p>
          3.1. Annual subscriptions are eligible for a full refund within 14 days of the initial
          purchase, as described in Section 1.
        </p>
        <p>
          3.2. After the 14-day period, annual subscriptions are non-refundable. You may cancel at
          any time, but your access will continue until the end of the prepaid annual term.
        </p>
      </LegalSection>

      <LegalSection id="how-to-request-a-refund" title="How to Request a Refund">
        <p>
          4.1. To request a refund, please contact us at{" "}
          <a href="mailto:hello@opendocs.cc">hello@opendocs.cc</a> with the email address
          associated with your account. We aim to process all refund requests within 5 business
          days.
        </p>
        <p>
          4.2. Refunds are issued by Paddle to the original payment method used at the time of
          purchase. Depending on your payment provider, it may take an additional 5&ndash;10
          business days for the refund to appear on your statement.
        </p>
      </LegalSection>

      <LegalSection id="exceptions" title="Exceptions">
        <p>5.1. Refunds will not be issued in the following circumstances:</p>
        <ul>
          <li>
            The account was suspended or terminated due to a violation of our{" "}
            <Link href="/terms">Terms of Service</Link>.
          </li>
          <li>
            A chargeback or payment dispute has already been filed with your bank or payment
            provider for the same transaction.
          </li>
          <li>The refund request is made after the 14-day money-back period.</li>
        </ul>
      </LegalSection>

      <LegalSection id="downgrades-after-refund" title="Downgrades After Refund">
        <p>
          6.1. If a refund is issued, your account will be downgraded to the Free plan immediately.
          If you have more than 50 published documents, your existing documents will remain live and
          accessible, but you will be unable to publish new documents until you are within the Free
          plan limits or upgrade again.
        </p>
      </LegalSection>

      <LegalSection id="eu-consumer-rights" title="EU Consumer Rights">
        <p>
          7.1. If you are a consumer resident in the European Union or the European Economic Area,
          you have the right to withdraw from a purchase within 14 days without giving any reason,
          in accordance with the EU Consumer Rights Directive. This policy meets or exceeds that
          requirement.
        </p>
      </LegalSection>

      <LegalSection id="changes-to-this-policy" title="Changes to This Policy">
        <p>
          8.1. We reserve the right to update this Refund Policy at any time. If we make material
          changes, we will notify you by email or by posting a notice on our website. The updated
          policy will apply to purchases made after the effective date of the change.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>
          9.1. If you have any questions about this Refund Policy, please contact us at{" "}
          <a href="mailto:hello@opendocs.cc">hello@opendocs.cc</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
