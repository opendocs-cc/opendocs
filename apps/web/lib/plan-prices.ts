/**
 * List prices in USD, as charged by Paddle. The pricing page, the billing
 * page, /pricing.md and the agent manifest (/.well-known/agent.json) read
 * them from here, so change them here and in Paddle together.
 */
export const PLAN_PRICES = {
  pro: { monthly: 8, yearly: 72 },
  team: { monthlyPerSeat: 4, yearlyPerSeat: 36, minSeats: 3 },
} as const;

/** A yearly price as a per-month figure: 72 → 6. */
export const perMonth = (yearly: number) => yearly / 12;
