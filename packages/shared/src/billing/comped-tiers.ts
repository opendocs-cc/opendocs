import { isSelfHosted } from "../config/instance";
import type { PlanTier } from "./plan-limits";

export const COMPED_TIERS = ["friends", "creator"] as const;

export type CompedTier = (typeof COMPED_TIERS)[number];

/**
 * UNLOCK_ALL_FEATURES=true gives everyone creator access (everything on
 * Team, nothing to pay), for self-hosted instances without billing; with
 * SELF_HOSTED=true it's on unless set to false. It's read on every check
 * and stores nothing, so turning it off puts everyone back on their own
 * plan. Ignored while billing is on (BILLING_MODE sandbox
 * or production), so it can't give a paid instance away by accident.
 */
export function allFeaturesUnlocked(): boolean {
  const billingMode = (process.env.BILLING_MODE ?? "off").trim().toLowerCase();
  if (billingMode !== "off" && billingMode !== "") return false;
  const setting = process.env.UNLOCK_ALL_FEATURES?.trim().toLowerCase();
  // On by default on a self-hosted instance (SELF_HOSTED=true), unless
  // UNLOCK_ALL_FEATURES=false.
  return setting === "true" || (setting !== "false" && isSelfHosted());
}

export function normalizeCompedTier(value: string | null | undefined): CompedTier | null {
  if (allFeaturesUnlocked()) return "creator";
  return value === "friends" || value === "creator" ? value : null;
}

export function compedTierToPlanTier(tier: string | null | undefined): PlanTier | null {
  const normalized = normalizeCompedTier(tier);
  if (normalized === "creator") return "team";
  if (normalized === "friends") return "pro";
  return null;
}
