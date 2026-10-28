/**
 * Server-side Paddle configuration shared by the web app and API.
 *
 * This module intentionally does not read `NEXT_PUBLIC_PADDLE_*` client
 * tokens. Those are browser-only checkout tokens and remain owned by
 * `apps/web/lib/billing/config.ts`.
 */

export type BillingMode = "off" | "sandbox" | "production";

export type PlanTier = "pro" | "team";
export type BillingCycle = "monthly" | "yearly";
export type PlanPriceKey = `${PlanTier}_${BillingCycle}`;
export type AddOnKey = "pro_extra_workspace";
export type AddOnPriceKey = `${AddOnKey}_${BillingCycle}`;
export type PriceKey = PlanPriceKey | AddOnPriceKey;

export type PaddleEnvironment = "sandbox" | "production";

export interface ServerBillingConfig {
  mode: "sandbox" | "production";
  environment: PaddleEnvironment;
  apiKey: string;
  webhookSecret: string;
  /**
   * Paddle price IDs, keyed by plan+cycle. Not portable between sandbox
   * and production — the live catalog has its own set of IDs, so the
   * mapping is reloaded whenever BILLING_MODE flips.
   */
  prices: Record<PriceKey, string>;
}

export const ALL_PRICE_KEYS: PriceKey[] = [
  "pro_monthly",
  "pro_yearly",
  "team_monthly",
  "team_yearly",
  "pro_extra_workspace_monthly",
  "pro_extra_workspace_yearly",
];

export function readBillingMode(): BillingMode {
  const raw = (process.env.BILLING_MODE ?? "off").trim().toLowerCase();
  if (raw === "off" || raw === "sandbox" || raw === "production") {
    return raw;
  }
  throw new Error(
    `Invalid BILLING_MODE="${raw}". Expected "off" | "sandbox" | "production".`,
  );
}

export function requireBillingEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `BILLING_MODE requires the matching credential set — see .env.example.`,
    );
  }
  return value;
}

function readBundle(mode: "sandbox" | "production"): ServerBillingConfig {
  const prefix = mode === "sandbox" ? "PADDLE_SANDBOX" : "PADDLE_LIVE";

  const priceVars: Record<PriceKey, string> = {
    pro_monthly: `${prefix}_PRO_MONTHLY_PRICE_ID`,
    pro_yearly: `${prefix}_PRO_YEARLY_PRICE_ID`,
    team_monthly: `${prefix}_TEAM_MONTHLY_PRICE_ID`,
    team_yearly: `${prefix}_TEAM_YEARLY_PRICE_ID`,
    pro_extra_workspace_monthly: `${prefix}_PRO_EXTRA_WORKSPACE_MONTHLY_PRICE_ID`,
    pro_extra_workspace_yearly: `${prefix}_PRO_EXTRA_WORKSPACE_YEARLY_PRICE_ID`,
  };

  const prices = Object.fromEntries(
    ALL_PRICE_KEYS.map((key) => [key, requireBillingEnv(priceVars[key])]),
  ) as Record<PriceKey, string>;

  return {
    mode,
    environment: mode,
    apiKey: requireBillingEnv(`${prefix}_API_KEY`),
    webhookSecret: requireBillingEnv(`${prefix}_WEBHOOK_SECRET`),
    prices,
  };
}

/**
 * Resolved at module load. `null` when `BILLING_MODE=off` (or unset).
 */
const resolved: ServerBillingConfig | null = (() => {
  const mode = readBillingMode();
  if (mode === "off") return null;
  return readBundle(mode);
})();

export function getServerBillingConfig(): ServerBillingConfig | null {
  return resolved;
}

export function isBillingEnabled(): boolean {
  return resolved !== null;
}

export function requireServerBillingConfig(): ServerBillingConfig {
  if (!resolved) {
    throw new Error(
      "Billing is disabled (BILLING_MODE=off). Set BILLING_MODE=sandbox or " +
        "BILLING_MODE=production and provide the matching credentials.",
    );
  }
  return resolved;
}

export function getPriceId(plan: PlanTier, cycle: BillingCycle): string {
  const config = requireServerBillingConfig();
  return config.prices[`${plan}_${cycle}` as PlanPriceKey];
}

export function getProExtraWorkspacePriceId(cycle: BillingCycle): string {
  const config = requireServerBillingConfig();
  return config.prices[`pro_extra_workspace_${cycle}` as AddOnPriceKey];
}

/**
 * Reverse lookup — when a webhook arrives with a price_id we need to know
 * which plan+cycle it maps to. Returns null for prices not in our catalog
 * (e.g. legacy prices, unrelated Paddle products).
 */
export function resolvePriceId(
  priceId: string,
):
  | { kind: "plan"; plan: PlanTier; cycle: BillingCycle }
  | { kind: "addon"; addon: AddOnKey; cycle: BillingCycle }
  | null {
  const config = getServerBillingConfig();
  if (!config) return null;
  for (const key of ALL_PRICE_KEYS) {
    if (config.prices[key] === priceId) {
      if (key.startsWith("pro_extra_workspace_")) {
        const cycle = key.endsWith("_yearly") ? "yearly" : "monthly";
        return { kind: "addon", addon: "pro_extra_workspace", cycle };
      }
      const [plan, cycle] = key.split("_") as [PlanTier, BillingCycle];
      return { kind: "plan", plan, cycle };
    }
  }
  return null;
}
