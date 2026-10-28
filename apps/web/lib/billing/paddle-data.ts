import "server-only";

import { cache } from "react";

import { getPaddle } from "./paddle";
import { resolvePriceId } from "./config";

/**
 * Server-side helpers that read live data from Paddle's API for the
 * billing page — payment method on file, recent invoices, and a signed
 * "update payment method" URL for the hosted Paddle page.
 *
 * Everything here is wrapped in React `cache()` so the billing page's
 * parallel Promise.all doesn't double-fetch if a child component also
 * ends up requesting the same slice within one render pass.
 *
 * Failure mode is graceful by design: if Paddle is unreachable we return
 * null / [] instead of throwing. The billing page renders "—" placeholders
 * or an empty state rather than a crash screen — the user still has
 * access to their plan and to the in-app change flow, which is what
 * matters. We also log to the console so production errors are visible.
 */

export interface PaymentMethodSummary {
  /** Raw Paddle brand id ("visa" | "mastercard" | "american_express" | …). */
  brand: string;
  /** Display-friendly brand label ("Visa", "Mastercard", …). */
  brandLabel: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string;
}

/** One row on the invoices table. */
export interface InvoiceSummary {
  /** Paddle transaction id — pass to getInvoiceDownloadUrlAction. */
  id: string;
  /** Human-readable invoice number (`INV-1234`); may be null pre-billing. */
  invoiceNumber: string | null;
  /** ISO 8601 — null if the invoice hasn't been billed yet. */
  billedAt: string | null;
  status:
    | "paid"
    | "completed"
    | "billed"
    | "past_due"
    | "canceled"
    | "draft"
    | "ready";
  /** Pre-formatted for display ($15.00, £12.34, ¥1,980). */
  amountFormatted: string;
  currencyCode: string;
  /** "Pro monthly" / "Team yearly" / "—" if the price id isn't in our catalog. */
  planLabel: string;
}

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  american_express: "American Express",
  discover: "Discover",
  diners_club: "Diners Club",
  jcb: "JCB",
  mada: "Mada",
  maestro: "Maestro",
  union_pay: "UnionPay",
  unknown: "Card",
};

/**
 * Fetches the card currently on file for this subscription.
 *
 * Two-tier lookup:
 *
 *   1. `/customers/{id}/payment-methods` — the canonical "saved cards"
 *      endpoint. In production, cards entered through overlay checkout
 *      land here automatically, so this is the cheapest successful path.
 *
 *   2. Fallback: pull the `payments[].method_details.card` off the most
 *      recent successful transaction on this subscription. That's the
 *      card that was actually charged and that Paddle will charge again
 *      on renewal — it's always present on any sub with a paid history,
 *      even when the "saved payment methods" list is empty (which
 *      happens in sandbox, and can happen in prod when the customer
 *      checked "don't save this card" during a non-subscription purchase).
 *
 * Both paths can fail independently; we return null only if both do.
 */
function cardToSummary(card: {
  type: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string;
}): PaymentMethodSummary {
  return {
    brand: card.type,
    brandLabel: BRAND_LABELS[card.type] ?? "Card",
    last4: card.last4,
    expiryMonth: card.expiryMonth,
    expiryYear: card.expiryYear,
    cardholderName: card.cardholderName,
  };
}

async function loadPaymentMethodSummary(
  customerId: string,
  subscriptionId: string,
): Promise<PaymentMethodSummary | null> {
  // Path 1: saved payment methods.
  try {
    const paddle = getPaddle();
    const collection = paddle.paymentMethods.list(customerId, { perPage: 5 });
    const page = await collection.next();
    const primary = page.find((pm) => pm.card);
    if (primary?.card) return cardToSummary(primary.card);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      "[paddle] paymentMethods.list failed, falling back to transaction:",
      error,
    );
  }

  // Path 2: latest successful transaction.
  try {
    const paddle = getPaddle();
    const collection = paddle.transactions.list({
      subscriptionId: [subscriptionId],
      // "completed" = fully processed (what we care about for the most
      // recent successful charge). Include "paid" too for transactions
      // that have captured funds but aren't flagged completed yet.
      status: ["completed", "paid"],
      // Look past recent $0 transactions (covered by credit from a
      // downgrade or fewer seats), which carry no card.
      perPage: 20,
      orderBy: "billed_at[desc]",
    });
    const page = await collection.next();
    for (const tx of page) {
      const captured = tx.payments.find(
        (p) => p.methodDetails?.card && p.status === "captured",
      );
      const card =
        captured?.methodDetails?.card ??
        tx.payments.find((p) => p.methodDetails?.card)?.methodDetails?.card;
      if (card) return cardToSummary(card);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[paddle] transaction-based payment method lookup failed:", error);
  }

  return null;
}

async function loadInvoices(
  customerId: string,
  limit = 10,
): Promise<InvoiceSummary[]> {
  try {
    const paddle = getPaddle();
    const collection = paddle.transactions.list({
      customerId: [customerId],
      // Skip "draft" / "ready" — those are in-flight transactions the
      // customer hasn't been billed for yet. Include "billed" / "past_due"
      // because the user should still see what they owe.
      status: ["paid", "completed", "past_due", "billed"],
      perPage: limit,
      orderBy: "billed_at[desc]",
    });
    const page = await collection.next();

    return page.map<InvoiceSummary>((tx) => {
      // Pick the first line item's price to label the invoice. "Pro monthly"
      // beats trying to read a per-item description; our catalog is small.
      const firstPriceId = tx.items[0]?.price?.id ?? null;
      const mapped = firstPriceId ? resolvePriceId(firstPriceId) : null;
      const planLabel = mapped
        ? mapped.kind === "plan"
          ? `${capitalize(mapped.plan)} ${mapped.cycle}`
          : `Extra workspace ${mapped.cycle}`
        : "—";

      const total = tx.details?.totals?.grandTotal ?? "0";
      return {
        id: tx.id,
        invoiceNumber: tx.invoiceNumber,
        billedAt: tx.billedAt,
        status: tx.status as InvoiceSummary["status"],
        amountFormatted: formatMoney(total, tx.currencyCode),
        currencyCode: tx.currencyCode,
        planLabel,
      };
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[paddle] invoice list fetch failed:", error);
    return [];
  }
}

async function loadPortalUpdatePaymentUrl(
  customerId: string,
  subscriptionId: string,
): Promise<string | null> {
  try {
    const paddle = getPaddle();
    const portal = await paddle.customerPortalSessions.create(customerId, [
      subscriptionId,
    ]);
    // The session URL we want is the one scoped to THIS subscription's
    // "update payment method" flow — Paddle's hosted page that swaps
    // the card without any PCI exposure on our side.
    const match = portal.urls.subscriptions.find(
      (s) => s.id === subscriptionId,
    );
    return match?.updateSubscriptionPaymentMethod ?? null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[paddle] portal session creation failed:", error);
    return null;
  }
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Paddle returns `grand_total` as a string of the currency's lowest
 * denomination (cents for USD, pence for GBP, yen for JPY where there
 * is no subdivision). We ask Intl.NumberFormat what the digit count is
 * for this currency and divide accordingly — so JPY 1980 renders as
 * "¥1,980" and USD 1500 as "$15.00".
 */
function formatMoney(minorUnits: string, currency: string): string {
  const n = Number.parseInt(minorUnits, 10);
  if (!Number.isFinite(n)) return `${minorUnits} ${currency}`;
  try {
    const fmt = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
    });
    const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
    const factor = 10 ** digits;
    return fmt.format(n / factor);
  } catch {
    // Unknown currency → plain "NNN.NN XXX" fallback. Intl throws on
    // bogus currency codes, and we'd rather show something than nothing.
    return `${(n / 100).toFixed(2)} ${currency}`;
  }
}

export const getPaymentMethodSummary = cache(loadPaymentMethodSummary);
export const getInvoices = cache(loadInvoices);
export const getPortalUpdatePaymentUrl = cache(loadPortalUpdatePaymentUrl);
