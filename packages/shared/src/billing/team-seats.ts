import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import { subscriptions, workspaceMembers, workspaces } from "../db/schema";
import { getPaddle } from "./paddle-client";
import { resolvePriceId } from "./paddle-config";
import { inCurrentBillingEnvironment } from "./environment";

const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "paused"] as const;
const TEAM_MIN_SEATS = 3;
const UPDATABLE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"] as const;

type PaddleSubscriptionItem = {
  price?: { id?: string | null } | null;
  quantity?: number | null;
};

export type EnsureTeamSeatCapacityResult =
  | { ok: true; changed: boolean; requiredSeats: number }
  | {
      ok: false;
      error: "billing_unavailable" | "paddle_error" | "subscription_not_updatable";
    };

function buildTeamSeatItems(
  items: PaddleSubscriptionItem[],
  fallbackTeamPriceId: string,
  requiredSeats: number,
): Array<{ priceId: string; quantity: number }> {
  const result: Array<{ priceId: string; quantity: number }> = [];
  let sawTeamPlan = false;

  for (const item of items) {
    const priceId = item.price?.id;
    if (!priceId) continue;

    const mapped = resolvePriceId(priceId);
    if (mapped?.kind === "plan" && mapped.plan === "team") {
      result.push({ priceId, quantity: requiredSeats });
      sawTeamPlan = true;
      continue;
    }

    result.push({ priceId, quantity: item.quantity ?? 1 });
  }

  if (!sawTeamPlan) {
    result.unshift({ priceId: fallbackTeamPriceId, quantity: requiredSeats });
  }

  return result;
}

type LiveTeamSubscription = {
  id: string;
  paddleSubscriptionId: string;
  paddlePriceId: string;
  seats: number;
  status: string;
};

async function findLiveTeamSubscription(ownerUserId: string): Promise<LiveTeamSubscription | null> {
  const database = getDbOrThrow();
  const [activeSub] = await database
    .select({
      id: subscriptions.id,
      paddleSubscriptionId: subscriptions.paddleSubscriptionId,
      paddlePriceId: subscriptions.paddlePriceId,
      seats: subscriptions.seats,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, ownerUserId),
        eq(subscriptions.plan, "team"),
        inCurrentBillingEnvironment(),
        inArray(subscriptions.status, [...LIVE_SUBSCRIPTION_STATUSES]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return activeSub ?? null;
}

/** Active members across every workspace the owner owns, each person once. */
async function countUniqueMembers(ownerUserId: string): Promise<number> {
  const database = getDbOrThrow();
  const [row] = await database
    .select({ count: sql<number>`count(distinct ${workspaceMembers.userId})::int` })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaces.ownerUserId, ownerUserId), eq(workspaceMembers.status, "active")));
  return row?.count ?? 0;
}

/** Sets the Team seat quantity in Paddle (prorated either way) and mirrors it locally. */
async function applyTeamSeats(
  activeSub: LiveTeamSubscription,
  seats: number,
): Promise<{ ok: true } | { ok: false; error: "billing_unavailable" | "paddle_error" | "subscription_not_updatable" }> {
  if (!(UPDATABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(activeSub.status)) {
    return { ok: false, error: "subscription_not_updatable" };
  }

  let paddle: ReturnType<typeof getPaddle>;
  try {
    paddle = getPaddle();
  } catch {
    return { ok: false, error: "billing_unavailable" };
  }

  try {
    const subscription = await paddle.subscriptions.get(activeSub.paddleSubscriptionId);
    const items = buildTeamSeatItems(
      subscription.items as PaddleSubscriptionItem[],
      activeSub.paddlePriceId,
      seats,
    );
    const updated = await paddle.subscriptions.update(activeSub.paddleSubscriptionId, {
      items,
      prorationBillingMode: "prorated_immediately",
    });

    await getDbOrThrow()
      .update(subscriptions)
      .set({
        seats,
        status: updated.status,
        currentPeriodStart: updated.currentBillingPeriod?.startsAt
          ? new Date(updated.currentBillingPeriod.startsAt)
          : null,
        currentPeriodEnd: updated.currentBillingPeriod?.endsAt
          ? new Date(updated.currentBillingPeriod.endsAt)
          : null,
        cancelAtPeriodEnd: updated.scheduledChange?.action === "cancel",
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, activeSub.id));
    return { ok: true };
  } catch (error) {
    console.error("[paddle] team seat update failed:", error);
    return { ok: false, error: "paddle_error" };
  }
}

/**
 * Ensures a paying Team owner has enough Paddle seats before we activate
 * a member across any of their owned workspaces.
 *
 * Team seats are account-scoped: one member can belong to many workspaces
 * owned by the same subscriber and should only count once.
 */
export async function ensureTeamSeatCapacity(
  ownerUserId: string,
  joiningUserId: string,
): Promise<EnsureTeamSeatCapacityResult> {
  const database = getDbOrThrow();
  const activeSub = await findLiveTeamSubscription(ownerUserId);
  if (!activeSub) {
    return { ok: true, changed: false, requiredSeats: TEAM_MIN_SEATS };
  }

  const [memberCount, [alreadyActive]] = await Promise.all([
    countUniqueMembers(ownerUserId),
    database
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaces.ownerUserId, ownerUserId),
          eq(workspaceMembers.userId, joiningUserId),
          eq(workspaceMembers.status, "active"),
        ),
      )
      .limit(1),
  ]);

  const requiredSeats = Math.max(TEAM_MIN_SEATS, memberCount + (alreadyActive ? 0 : 1));
  if (requiredSeats <= activeSub.seats) {
    return { ok: true, changed: false, requiredSeats };
  }

  const result = await applyTeamSeats(activeSub, requiredSeats);
  return result.ok ? { ok: true, changed: true, requiredSeats } : result;
}

/**
 * After someone stops being a member (removed, left, workspace deleted,
 * account deleted), bill the owner for the people who remain, never
 * fewer than the Team minimum. Paddle credits the unused time.
 * Best effort: a failure is logged and the seats are corrected the next
 * time membership changes.
 */
export async function releaseUnusedTeamSeats(ownerUserId: string): Promise<EnsureTeamSeatCapacityResult> {
  const activeSub = await findLiveTeamSubscription(ownerUserId);
  if (!activeSub) {
    return { ok: true, changed: false, requiredSeats: TEAM_MIN_SEATS };
  }
  const requiredSeats = Math.max(TEAM_MIN_SEATS, await countUniqueMembers(ownerUserId));
  if (requiredSeats >= activeSub.seats) {
    return { ok: true, changed: false, requiredSeats };
  }
  const result = await applyTeamSeats(activeSub, requiredSeats);
  return result.ok ? { ok: true, changed: true, requiredSeats } : result;
}
