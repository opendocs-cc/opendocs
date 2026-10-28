import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import { subscriptions, workspaces } from "../db/schema";
import { inCurrentBillingEnvironment } from "./environment";
import { getPaddle } from "./paddle-client";
import { getProExtraWorkspacePriceId, resolvePriceId } from "./paddle-config";
import { PLAN_LIMITS } from "./plan-limits";

export type PaddleSubscriptionItem = {
  price?: { id?: string | null } | null;
  quantity?: number | null;
};

type BillingCycle = "monthly" | "yearly";

const UPDATABLE_STATUSES = ["active", "trialing", "past_due"] as const;

export function getProExtraWorkspaceQuantity(items: PaddleSubscriptionItem[]): number {
  return items.reduce((total, item) => {
    const priceId = item.price?.id;
    const mapped = priceId ? resolvePriceId(priceId) : null;
    if (mapped?.kind !== "addon" || mapped.addon !== "pro_extra_workspace") {
      return total;
    }
    return total + Math.max(0, item.quantity ?? 0);
  }, 0);
}

/** The subscription's items with the extra-workspace add-on set to a quantity (dropped at 0). */
export function buildSubscriptionItemsWithProWorkspaceAddOn(
  items: PaddleSubscriptionItem[],
  cycle: BillingCycle,
  nextExtraWorkspaces: number,
): Array<{ priceId: string; quantity: number }> {
  const addonPriceId = getProExtraWorkspacePriceId(cycle);
  const result: Array<{ priceId: string; quantity: number }> = [];
  let sawAddon = false;

  for (const item of items) {
    const priceId = item.price?.id;
    if (!priceId) continue;

    const mapped = resolvePriceId(priceId);
    if (mapped?.kind === "addon" && mapped.addon === "pro_extra_workspace") {
      if (!sawAddon && nextExtraWorkspaces > 0) {
        result.push({ priceId: addonPriceId, quantity: nextExtraWorkspaces });
        sawAddon = true;
      }
      continue;
    }

    result.push({
      priceId,
      quantity: item.quantity ?? 1,
    });
  }

  if (!sawAddon && nextExtraWorkspaces > 0) {
    result.push({ priceId: addonPriceId, quantity: nextExtraWorkspaces });
  }

  return result;
}

export type ReleaseProWorkspacesResult =
  | { ok: true; changed: boolean; extraWorkspaces: number }
  | { ok: false; error: "billing_unavailable" | "paddle_error" };

/**
 * After a Pro owner deletes a workspace, stop billing for extra-workspace
 * slots they no longer use. Paddle credits the unused time. Never adds
 * slots: that only happens when someone asks for another workspace.
 */
export async function releaseUnusedProWorkspaces(ownerUserId: string): Promise<ReleaseProWorkspacesResult> {
  const database = getDbOrThrow();
  const [activeSub] = await database
    .select({
      paddleSubscriptionId: subscriptions.paddleSubscriptionId,
      billingCycle: subscriptions.billingCycle,
      extraWorkspaces: subscriptions.extraWorkspaces,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, ownerUserId),
        eq(subscriptions.plan, "pro"),
        inCurrentBillingEnvironment(),
        inArray(subscriptions.status, [...UPDATABLE_STATUSES]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  const currentExtra = Math.max(0, activeSub?.extraWorkspaces ?? 0);
  if (!activeSub || currentExtra === 0) {
    return { ok: true, changed: false, extraWorkspaces: currentExtra };
  }

  const [owned] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaces)
    .where(eq(workspaces.ownerUserId, ownerUserId));
  const neededExtra = Math.max(0, (owned?.count ?? 0) - PLAN_LIMITS.pro.workspaces);
  if (neededExtra >= currentExtra) {
    return { ok: true, changed: false, extraWorkspaces: currentExtra };
  }

  let paddle: ReturnType<typeof getPaddle>;
  try {
    paddle = getPaddle();
  } catch {
    return { ok: false, error: "billing_unavailable" };
  }

  try {
    const subscription = await paddle.subscriptions.get(activeSub.paddleSubscriptionId);
    const updated = await paddle.subscriptions.update(activeSub.paddleSubscriptionId, {
      items: buildSubscriptionItemsWithProWorkspaceAddOn(
        subscription.items as PaddleSubscriptionItem[],
        activeSub.billingCycle,
        neededExtra,
      ),
      prorationBillingMode: "prorated_immediately",
    });
    const extraWorkspaces = getProExtraWorkspaceQuantity(updated.items as PaddleSubscriptionItem[]);
    await database
      .update(subscriptions)
      .set({ extraWorkspaces, status: updated.status, updatedAt: new Date() })
      .where(eq(subscriptions.paddleSubscriptionId, activeSub.paddleSubscriptionId));
    return { ok: true, changed: true, extraWorkspaces };
  } catch (error) {
    console.error("[paddle] releasing extra Pro workspaces failed:", error);
    return { ok: false, error: "paddle_error" };
  }
}
