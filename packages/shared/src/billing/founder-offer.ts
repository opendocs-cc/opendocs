import { readBillingMode, type BillingMode, type PlanTier } from "./paddle-config";

/**
 * The founding-member offer: Pro at half price ($4/month or $36/year) for
 * anyone who subscribes before FOUNDER_OFFER_ENDS_AT, locked in for as long
 * as that subscription stays active.
 *
 * It's one Paddle discount per environment (50%, recurring forever,
 * restricted to the two Pro plan prices, `expires_at` = the deadline), not
 * a separate set of prices, so price ids, plan switches and the add-on
 * code don't change. Checkout attaches the discount while the offer is
 * open; after that Paddle keeps applying it to the subscriptions that
 * already carry it, renewals and monthly/yearly switches included
 * (`expires_at` only stops new checkouts). Team and the extra-workspace
 * add-on aren't in `restrict_to`, so they stay full price.
 *
 * Reads the environment on every call (no module-load snapshot) so the
 * deadline is checked against the current clock. With the discount id or
 * the deadline unset, or the deadline unparseable, there is no offer.
 * FOUNDER_OFFER_STARTS_AT (optional) keeps it closed until a launch date,
 * so the settings can go on the server ahead of time.
 */

export interface FounderOffer {
  /** Paddle discount id (`dsc_…`) for the environment BILLING_MODE points at. */
  discountId: string;
  /** New checkouts stop getting the discount at this instant. */
  endsAt: Date;
}

type Env = Record<string, string | undefined>;

/**
 * The founder discount id for the environment BILLING_MODE points at, open
 * or not. It has to stay set after the deadline: founders keep their price,
 * and it's how their subscriptions are recognized.
 */
export function getFounderDiscountId(
  env: Env = process.env,
  mode: BillingMode = readBillingMode(),
): string | null {
  if (mode === "off") return null;
  const name =
    mode === "sandbox"
      ? "PADDLE_SANDBOX_FOUNDER_DISCOUNT_ID"
      : "PADDLE_LIVE_FOUNDER_DISCOUNT_ID";
  const value = env[name]?.trim();
  return value ? value : null;
}

function readDate(raw: string | undefined): Date | null {
  const value = raw?.trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The offer while new subscribers can still get it, otherwise null. */
export function getActiveFounderOffer(
  now: Date = new Date(),
  env: Env = process.env,
  mode: BillingMode = readBillingMode(),
): FounderOffer | null {
  const discountId = getFounderDiscountId(env, mode);
  const endsAt = readDate(env.FOUNDER_OFFER_ENDS_AT);
  if (!discountId || !endsAt) return null;
  // A start date that's set but unparseable keeps the offer closed rather
  // than opening it early.
  if (env.FOUNDER_OFFER_STARTS_AT?.trim()) {
    const startsAt = readDate(env.FOUNDER_OFFER_STARTS_AT);
    if (!startsAt || now.getTime() < startsAt.getTime()) return null;
  }
  return now.getTime() < endsAt.getTime() ? { discountId, endsAt } : null;
}

/** Whether a subscription's Paddle discount is the founder discount. */
export function isFounderDiscount(
  discountId: string | null | undefined,
  env: Env = process.env,
  mode: BillingMode = readBillingMode(),
): boolean {
  if (!discountId) return false;
  return getFounderDiscountId(env, mode) === discountId;
}

/**
 * The discount a plan change has to put back on a subscription, or null.
 *
 * Paddle keeps the founder discount through monthly/yearly switches and
 * add-on changes, but removes it when the subscription moves to Team,
 * which it doesn't cover. So a founding member switching back to Pro
 * needs it sent again, after the deadline too: Paddle accepts an expired
 * discount on a subscription update and only refuses it at checkout.
 */
export function founderDiscountToRestore(
  input: {
    plan: PlanTier;
    foundingMember: boolean;
    currentDiscountId: string | null;
  },
  env: Env = process.env,
  mode: BillingMode = readBillingMode(),
): string | null {
  if (input.plan !== "pro" || !input.foundingMember) return null;
  const discountId = getFounderDiscountId(env, mode);
  if (!discountId || input.currentDiscountId === discountId) return null;
  return discountId;
}
