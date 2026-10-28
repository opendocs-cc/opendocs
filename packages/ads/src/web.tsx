/**
 * Browser side of the optional ads add-on. This placeholder does nothing;
 * production builds replace this package with a private one that loads the
 * ad pixels (see packages/ads/README.md). The web app only calls these after
 * the visitor's consent allows ads (apps/web/lib/ad-tracking/consent.ts).
 */

export type CheckoutInput = { plan: string; cycle: string };
export type PurchaseInput = { value?: number; currency: string };

/** The pixel scripts, rendered once consent allows them. */
export function AdScripts(): null {
  return null;
}

export function trackLead(_method: string): void {}

/** `eventId` is shared with the server-side event, so networks count it once. */
export function trackRegistration(_eventId: string): void {}

export function trackCheckoutStarted(_eventId: string, _input: CheckoutInput): void {}

export function trackPurchase(_eventId: string, _input: PurchaseInput): void {}
