import "server-only";

import {
  getServerBillingConfig,
  getPriceId,
  getProExtraWorkspacePriceId,
  isBillingEnabled,
  requireBillingEnv,
  requireServerBillingConfig,
  resolvePriceId,
  type AddOnKey,
  type AddOnPriceKey,
  type BillingCycle,
  type BillingMode,
  type PaddleEnvironment,
  type PlanPriceKey,
  type PlanTier,
  type PriceKey,
  type ServerBillingConfig,
} from "@opendocs/shared/billing/paddle-config";

export {
  getPriceId,
  getProExtraWorkspacePriceId,
  isBillingEnabled,
  resolvePriceId,
  type AddOnKey,
  type AddOnPriceKey,
  type BillingCycle,
  type BillingMode,
  type PaddleEnvironment,
  type PlanPriceKey,
  type PlanTier,
  type PriceKey,
};

export interface BillingConfig extends ServerBillingConfig {
  /** Paddle browser checkout token for the active environment. */
  clientToken: string;
}

function requireClientToken(mode: "sandbox" | "production"): string {
  const name =
    mode === "sandbox"
      ? "NEXT_PUBLIC_PADDLE_SANDBOX_CLIENT_TOKEN"
      : "NEXT_PUBLIC_PADDLE_LIVE_CLIENT_TOKEN";
  return requireBillingEnv(name);
}

export function getBillingConfig(): BillingConfig | null {
  const config = getServerBillingConfig();
  if (!config) return null;
  return { ...config, clientToken: requireClientToken(config.mode) };
}

export function requireBillingConfig(): BillingConfig {
  const config = requireServerBillingConfig();
  return { ...config, clientToken: requireClientToken(config.mode) };
}
