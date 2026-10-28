import "server-only";

import { cache } from "react";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";

import { db } from "@opendocs/shared/db";
import {
  allFeaturesUnlocked,
  compedTierToPlanTier,
  normalizeCompedTier,
} from "@opendocs/shared/billing/comped-tiers";
import {
  subscriptions,
  user as userTable,
  workspaces,
} from "@opendocs/shared/db/schema";

import { isBillingEnabled } from "./config";
import { inCurrentBillingEnvironment } from "@opendocs/shared/billing/environment";
import {
  getFounderDiscountId,
  isFounderDiscount,
} from "@opendocs/shared/billing/founder-offer";

/**
 * Billing state for the signed-in user, scoped to a workspace.
 *
 * The billing page renders from a single call to this — one DB read
 * that returns the user's personal plan, the workspace's plan, and
 * enough subscription metadata to show the "Active" pill and invoice
 * list. `getUserPlan` in workspaces/service already covers the legacy
 * "is this user Pro?" use-case; this function is the broader view the
 * billing page needs.
 */

export interface BillingState {
  enabled: boolean;
  userPlan: "free" | "pro";
  workspacePlan: "free" | "team";
  compedTier: string | null;
  /** Highest-tier plan the current scope is on. team > pro > free. */
  effectivePlan: "free" | "pro" | "team";
  subscription:
    | {
        id: string;
        plan: "pro" | "team";
        status: "active" | "trialing" | "past_due" | "paused" | "canceled";
        billingCycle: "monthly" | "yearly";
        seats: number;
        extraWorkspaces: number;
        currentPeriodEnd: Date | null;
        cancelAtPeriodEnd: boolean;
        paddleSubscriptionId: string;
        paddleCustomerId: string;
        /** On Pro with the founder discount: paying the founding-member price now. */
        founderPrice: boolean;
        /** Subscribed during the founder offer. Back on Pro, the founder price returns. */
        foundingMember: boolean;
      }
    | null;
}

async function loadBillingState(
  userId: string,
  workspaceId: string | null,
): Promise<BillingState> {
  if (!db || !isBillingEnabled()) {
    // Without billing, everyone is on Free, unless UNLOCK_ALL_FEATURES
    // gives them creator access.
    const unlocked = allFeaturesUnlocked();
    return {
      enabled: false,
      userPlan: unlocked ? "pro" : "free",
      workspacePlan: unlocked ? "team" : "free",
      compedTier: unlocked ? "creator" : null,
      effectivePlan: unlocked ? "team" : "free",
      subscription: null,
    };
  }

  // Pull user.plan, workspace.plan, and live Team entitlement in one
  // parallel wave. Team is now user-scoped; workspacePlan remains for
  // legacy workspace-scoped Team rows that may still exist.
  const [[userRow], workspaceRows, [teamSubRow]] = await Promise.all([
    db
      .select({ plan: userTable.plan, compedTier: userTable.compedTier })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1),
    workspaceId
      ? db
          .select({ plan: workspaces.plan })
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId))
          .limit(1)
      : Promise.resolve([] as Array<{ plan: "free" | "pro" | "team" }>),
    db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.plan, "team"),
          inCurrentBillingEnvironment(),
          inArray(subscriptions.status, ["active", "trialing", "past_due", "paused"]),
        ),
      )
      .orderBy(desc(subscriptions.createdAt))
      .limit(1),
  ]);

  const rawUserPlan = userRow?.plan ?? "free";
  const compedTier = normalizeCompedTier(userRow?.compedTier);
  const compedPlan = compedTierToPlanTier(compedTier);
  const userPlan: "free" | "pro" =
    rawUserPlan === "pro" || compedPlan === "pro" || compedPlan === "team"
      ? "pro"
      : "free";
  const rawWsPlan = workspaceRows[0]?.plan ?? "free";
  const hasUserTeam = Boolean(teamSubRow);
  const workspacePlan: "free" | "team" =
    rawWsPlan === "team" || hasUserTeam || compedPlan === "team" ? "team" : "free";

  // For the subscription detail card, pick the sub that matches the
  // effective plan scope. Team takes precedence when the workspace is
  // on Team; otherwise fall back to the user's Pro sub.
  const targetFilter =
    hasUserTeam
      ? and(eq(subscriptions.userId, userId), eq(subscriptions.plan, "team"))
      : workspacePlan === "team" && workspaceId
      ? and(eq(subscriptions.workspaceId, workspaceId), eq(subscriptions.plan, "team"))
      : eq(subscriptions.userId, userId);

  const [subRow] = await db
    .select({
      id: subscriptions.id,
      plan: subscriptions.plan,
      status: subscriptions.status,
      billingCycle: subscriptions.billingCycle,
      seats: subscriptions.seats,
      extraWorkspaces: subscriptions.extraWorkspaces,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      paddleSubscriptionId: subscriptions.paddleSubscriptionId,
      paddleCustomerId: subscriptions.paddleCustomerId,
      paddleDiscountId: subscriptions.paddleDiscountId,
      foundingMember: subscriptions.foundingMember,
    })
    .from(subscriptions)
    .where(
      and(
        targetFilter,
        inCurrentBillingEnvironment(),
        // Only surface "live" subs in the UI — canceled ones are history.
        inArray(subscriptions.status, ["active", "trialing", "past_due", "paused"]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  const effectivePlan: "free" | "pro" | "team" =
    workspacePlan === "team" ? "team" : userPlan === "pro" ? "pro" : "free";

  return {
    enabled: true,
    userPlan,
    workspacePlan,
    compedTier,
    effectivePlan,
    subscription: subRow
      ? {
          id: subRow.id,
          plan: subRow.plan === "team" ? "team" : "pro",
          status: subRow.status,
          billingCycle: subRow.billingCycle,
          seats: subRow.seats,
          extraWorkspaces: subRow.extraWorkspaces,
          currentPeriodEnd: subRow.currentPeriodEnd,
          cancelAtPeriodEnd: subRow.cancelAtPeriodEnd,
          paddleSubscriptionId: subRow.paddleSubscriptionId,
          paddleCustomerId: subRow.paddleCustomerId,
          founderPrice:
            subRow.plan === "pro" && isFounderDiscount(subRow.paddleDiscountId),
          foundingMember:
            subRow.foundingMember && getFounderDiscountId() !== null,
        }
      : null,
  };
}

export const getBillingState = cache(loadBillingState);

/**
 * Other workspaces the current user has bought Team for — excluding the
 * active workspace they're viewing billing on. Drives the "You already
 * own Team on X" context banner on /dashboard/billing, which removes the
 * "why does this say Free?" confusion when a multi-workspace owner lands
 * on billing for a workspace they haven't upgraded yet.
 *
 * Filters:
 *   - `subscriptions.userId = current user` — only subs THIS user is
 *     paying for; a co-owner's Team sub elsewhere shouldn't count.
 *   - `subscriptions.plan = "team"` — Pro is already user-level.
 *   - status ∈ live set — past_due and paused still entitle (access
 *     runs to period end); canceled is history.
 *   - workspaceId != currentWorkspaceId — banner is about *other*
 *     workspaces.
 */
export interface OtherTeamWorkspace {
  id: string;
  name: string;
  slug: string;
}

async function loadOtherTeamWorkspaces(
  userId: string,
  excludeWorkspaceId: string | null,
): Promise<OtherTeamWorkspace[]> {
  if (!db || !isBillingEnabled()) return [];

  const conditions = [
    eq(subscriptions.userId, userId),
    eq(subscriptions.plan, "team"),
    inCurrentBillingEnvironment(),
    inArray(subscriptions.status, [
      "active",
      "trialing",
      "past_due",
      "paused",
    ] as const),
  ];
  if (excludeWorkspaceId) {
    conditions.push(ne(subscriptions.workspaceId, excludeWorkspaceId));
  }

  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
    })
    .from(subscriptions)
    .innerJoin(workspaces, eq(workspaces.id, subscriptions.workspaceId))
    .where(and(...conditions))
    .orderBy(asc(workspaces.name));

  return rows;
}

export const getOtherTeamWorkspaces = cache(loadOtherTeamWorkspaces);
