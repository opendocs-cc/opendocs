import { eq } from "drizzle-orm";

import { subscriptions } from "../db/schema";
import { readBillingMode } from "./paddle-config";

export type BillingEnvironment = "sandbox" | "production";

/** The Paddle environment this server bills in (production when billing is off). */
export function currentBillingEnvironment(): BillingEnvironment {
  return readBillingMode() === "sandbox" ? "sandbox" : "production";
}

/** Only subscriptions from the environment this server bills in. */
export function inCurrentBillingEnvironment() {
  return eq(subscriptions.environment, currentBillingEnvironment());
}
