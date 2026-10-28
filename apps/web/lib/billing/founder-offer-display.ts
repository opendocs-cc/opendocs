import { useEffect, useState } from "react";

import { PLAN_PRICES } from "@/lib/plan-prices";

/**
 * Client-safe pieces of the founding-member offer: the prices it shows,
 * the deadline wording, and a hook that drops the offer from the page the
 * moment it ends. The offer itself is decided on the server
 * (lib/billing/founder-offer.ts); components only get its deadline.
 */

export interface FounderOfferView {
  /** ISO 8601. */
  endsAt: string;
}

export const PRO_PRICES = PLAN_PRICES.pro;
/** Half the Pro prices: what the founder discount in Paddle comes to. */
export const FOUNDER_PRO_PRICES = {
  monthly: PLAN_PRICES.pro.monthly / 2,
  yearly: PLAN_PRICES.pro.yearly / 2,
} as const;

/**
 * "November 30" (or "Nov 30"). Formatted in UTC, the zone the deadline is
 * set in, so the server and every browser print the same day.
 */
export function formatOfferEnd(
  endsAt: string,
  month: "long" | "short" = "long",
): string {
  return new Date(endsAt).toLocaleDateString("en-US", {
    month,
    day: "numeric",
    timeZone: "UTC",
  });
}

// setTimeout fires immediately for delays past 2^31 - 1 ms (~24.8 days).
const MAX_TIMER_MS = 2_147_483_647;

/**
 * True while the offer is open. Starts as the server rendered it (no
 * hydration mismatch), then follows the browser's clock: a tab left open
 * across the deadline, or a page served from a cache, drops the offer by
 * itself.
 */
export function useFounderOfferOpen(offer: FounderOfferView | null): boolean {
  const endsAt = offer?.endsAt ?? null;
  const [open, setOpen] = useState(endsAt !== null);

  useEffect(() => {
    if (!endsAt) {
      setOpen(false);
      return;
    }
    const remaining = new Date(endsAt).getTime() - Date.now();
    if (remaining <= 0) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (remaining > MAX_TIMER_MS) return;
    const timer = setTimeout(() => setOpen(false), remaining);
    return () => clearTimeout(timer);
  }, [endsAt]);

  return open;
}
