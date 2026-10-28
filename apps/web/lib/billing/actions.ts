"use server";

import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@opendocs/shared/db";
import { subscriptions, workspaceMembers } from "@opendocs/shared/db/schema";
import { PLAN_LIMITS } from "@opendocs/shared/billing/plan-limits";
import {
  getOwnedWorkspaceCount,
  getOwnedWorkspaceUniqueMemberCount,
} from "@opendocs/shared/workspaces/service";

import { requireServerSession } from "@/lib/auth/session";
import {
  getPriceId,
  getProExtraWorkspacePriceId,
  requireBillingConfig,
  resolvePriceId,
  type BillingCycle,
} from "./config";
import { getPaddle } from "./paddle";
import { reconcileUserPlan, reconcileWorkspacePlan } from "./reconcile";
import { getBillingState } from "./state";
import type { OpendocsCustomData } from "./custom-data";
import { inCurrentBillingEnvironment } from "@opendocs/shared/billing/environment";
import {
  founderDiscountToRestore,
  getActiveFounderOffer,
  isFounderDiscount,
} from "@opendocs/shared/billing/founder-offer";
import {
  buildSubscriptionItemsWithProWorkspaceAddOn,
  getProExtraWorkspaceQuantity,
  type PaddleSubscriptionItem,
} from "@opendocs/shared/billing/pro-workspaces";

/**
 * Server Action to start a Paddle checkout. Returns a transaction ID
 * that the client then hands to `Paddle.Checkout.open({ transactionId })`.
 *
 * Shape deliberately matches the overlay-checkout flow:
 *   1. Client calls this from a form submit or button handler.
 *   2. We authenticate via session, resolve the price, create a Paddle
 *      transaction with `customData` so the webhook later knows who
 *      paid.
 *   3. Return the transaction ID.
 *   4. Client opens the Paddle overlay — user pays inside Paddle's iframe.
 *   5. Paddle fires `subscription.created` (and friends); our webhook
 *      handler applies the state change.
 *
 * We intentionally don't wait for the subscription to appear in our DB
 * before returning — the checkout UX should be snappy, and the webhook
 * is the source of truth.
 */

const startCheckoutSchema = z.discriminatedUnion("plan", [
  z.object({
    plan: z.literal("pro"),
    cycle: z.enum(["monthly", "yearly"]),
  }),
  z.object({
    plan: z.literal("team"),
    cycle: z.enum(["monthly", "yearly"]),
    workspaceId: z.string().min(1),
    seats: z.number().int().min(3).max(500),
  }),
]);

export type StartCheckoutInput = z.infer<typeof startCheckoutSchema>;

export interface StartCheckoutResult {
  transactionId: string;
  /** The public client token for the active Paddle environment. The
   *  client uses this to initialize Paddle.js before opening the overlay.
   *  We return it alongside the transaction to avoid a second round-trip. */
  clientToken: string;
  environment: "sandbox" | "production";
  /** Pre-fills the checkout so people don't retype the email they signed in with. */
  customerEmail: string;
}

export async function startCheckoutAction(
  input: StartCheckoutInput,
): Promise<
  | { ok: true; data: StartCheckoutResult }
  | { ok: false; error: string; members?: number }
> {
  if (!db) {
    return { ok: false, error: "database_unavailable" };
  }

  // Parse defensively — even though this is a Server Action (same-origin,
  // signed), zod gives us a clean 400 for malformed client payloads.
  const parsed = startCheckoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }

  let config;
  try {
    config = requireBillingConfig();
  } catch {
    return { ok: false, error: "billing_disabled" };
  }

  const session = await requireServerSession();
  const userId = session.user.id;

  if (parsed.data.plan === "team") {
    const [membership] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, parsed.data.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);

    // Team is billed to the buyer's account and covers the workspaces
    // the buyer owns, so only this workspace's owner can put it on Team.
    if (!membership || membership.role !== "owner") {
      return { ok: false, error: "owner_only" };
    }

    // Every active member of the owner's workspaces needs a seat.
    const members = await getOwnedWorkspaceUniqueMemberCount(userId);
    if (parsed.data.seats < members) {
      return { ok: false, error: "seats_below_members", members };
    }
  }

  // One live subscription per account: plan changes go through
  // changeSubscriptionAction. A second checkout would bill twice.
  const [liveSub] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        inCurrentBillingEnvironment(),
        inArray(subscriptions.status, ["active", "trialing", "past_due", "paused"]),
      ),
    )
    .limit(1);
  if (liveSub) {
    return { ok: false, error: "already_subscribed" };
  }

  const priceId = getPriceId(parsed.data.plan, parsed.data.cycle);
  const quantity = parsed.data.plan === "team" ? parsed.data.seats : 1;

  const customData: OpendocsCustomData =
    {
      opendocsScope: "user",
      userId,
    };

  // Founding-member price: a Pro checkout before the deadline carries the
  // founder discount, and Paddle keeps applying it to the subscription
  // from then on. The overlay opens this transaction, so it shows the
  // discounted total.
  const founderOffer =
    parsed.data.plan === "pro" ? getActiveFounderOffer() : null;

  try {
    const paddle = getPaddle();
    const createTransaction = (discountId: string | null) =>
      paddle.transactions.create({
        items: [{ priceId, quantity }],
        customData: customData as unknown as Record<string, string>,
        ...(discountId ? { discountId } : {}),
      });
    let transaction;
    try {
      transaction = await createTransaction(founderOffer?.discountId ?? null);
    } catch (error) {
      // The deadline passed between our check and Paddle's. Paddle refuses
      // an expired discount, so this checkout is at the regular price,
      // which the overlay shows before anything is paid.
      if (!founderOffer || (error as { code?: unknown }).code !== "discount_expired") {
        throw error;
      }
      transaction = await createTransaction(null);
    }

    // We don't persist the transaction here — the subscription row only
    // appears after successful checkout (via the subscription.created
    // webhook). Stashing a pending transaction locally would just create
    // a second source of truth to reconcile.
    return {
      ok: true,
      data: {
        transactionId: transaction.id,
        clientToken: config.clientToken,
        environment: config.environment,
        customerEmail: session.user.email,
      },
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[paddle] transaction creation failed:", error);
    return { ok: false, error: "paddle_error" };
  }
}

/**
 * Changes an existing subscription in place — the user's saved payment
 * method is billed for the prorated delta (or credited on a downgrade).
 * No new checkout overlay, no card re-entry.
 *
 * Supports any of: switching plan type (Pro ↔ Team), switching cycle
 * (monthly ↔ yearly), or adjusting seat count on Team.
 *
 * Flow:
 *   1. Validate input + auth the target (Team requires admin on workspace).
 *   2. Look up the user's updatable subscription.
 *   3. Call `paddle.subscriptions.update()` — Paddle does the billing.
 *   4. Write the authoritative new state into our DB immediately so the
 *      UI reflects the change on the next render. The subsequent
 *      `subscription.updated` webhook will idempotently re-assert the
 *      same state, so we can't drift.
 *   5. Reconcile the denormalized `user.plan` / `workspaces.plan`
 *      columns for both the old and new scopes.
 *
 * Returns `no_active_subscription` if the user has nothing to change;
 * the client should fall back to `startCheckoutAction` in that case.
 */
const changeSubscriptionSchema = z.discriminatedUnion("plan", [
  z.object({
    plan: z.literal("pro"),
    cycle: z.enum(["monthly", "yearly"]),
  }),
  z.object({
    plan: z.literal("team"),
    cycle: z.enum(["monthly", "yearly"]),
    workspaceId: z.string().min(1),
    seats: z.number().int().min(3).max(500),
  }),
]);

export type ChangeSubscriptionInput = z.infer<typeof changeSubscriptionSchema>;

/** Statuses where Paddle will accept an `update` call. `paused` subs the
 *  user explicitly stopped, and `canceled` is terminal. */
const UPDATABLE_STATUSES = ["active", "trialing", "past_due"] as const;

export async function changeSubscriptionAction(
  input: ChangeSubscriptionInput,
): Promise<{ ok: true } | { ok: false; error: string; members?: number }> {
  if (!db) {
    return { ok: false, error: "database_unavailable" };
  }

  const parsed = changeSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }

  try {
    requireBillingConfig();
  } catch {
    return { ok: false, error: "billing_disabled" };
  }

  const session = await requireServerSession();
  const userId = session.user.id;

  // Team target must come from an owner/admin of the workspace.
  if (parsed.data.plan === "team") {
    const [membership] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, parsed.data.workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);

    // Team is billed to the buyer's account and covers the workspaces
    // the buyer owns, so only this workspace's owner can put it on Team.
    if (!membership || membership.role !== "owner") {
      return { ok: false, error: "owner_only" };
    }

    // Every active member of the owner's workspaces needs a seat.
    const members = await getOwnedWorkspaceUniqueMemberCount(userId);
    if (parsed.data.seats < members) {
      return { ok: false, error: "seats_below_members", members };
    }
  }

  // Find the user's updatable subscription. A single user may have
  // multiple subs (Pro on self + Team on a workspace they bought) — we
  // pick the most recent one by default. If we ever support truly
  // parallel subs we'll need the client to pass the subscription id.
  const [activeSub] = await db
    .select({
      paddleSubscriptionId: subscriptions.paddleSubscriptionId,
      paddlePriceId: subscriptions.paddlePriceId,
      paddleDiscountId: subscriptions.paddleDiscountId,
      foundingMember: subscriptions.foundingMember,
      extraWorkspaces: subscriptions.extraWorkspaces,
      workspaceId: subscriptions.workspaceId,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        inCurrentBillingEnvironment(),
        inArray(subscriptions.status, [...UPDATABLE_STATUSES]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  if (!activeSub) {
    return { ok: false, error: "no_active_subscription" };
  }

  const priceId = getPriceId(parsed.data.plan, parsed.data.cycle);
  const quantity = parsed.data.plan === "team" ? parsed.data.seats : 1;
  const extraWorkspaces =
    parsed.data.plan === "pro" ? Math.max(0, activeSub.extraWorkspaces ?? 0) : 0;

  if (parsed.data.plan === "pro") {
    const ownedWorkspaceCount = await getOwnedWorkspaceCount(userId);
    const nextLimit = PLAN_LIMITS.pro.workspaces + extraWorkspaces;
    if (ownedWorkspaceCount > nextLimit) {
      return { ok: false, error: "workspace_limit_exceeded" };
    }
  }

  const customData: OpendocsCustomData =
    {
      opendocsScope: "user",
      userId,
    };

  const items =
    parsed.data.plan === "pro" && extraWorkspaces > 0
      ? [
          { priceId, quantity },
          {
            priceId: getProExtraWorkspacePriceId(parsed.data.cycle),
            quantity: extraWorkspaces,
          },
        ]
      : [{ priceId, quantity }];

  // A founding member coming back to Pro from Team, where Paddle drops
  // the founder discount, gets it put back.
  const restoreDiscountId = founderDiscountToRestore({
    plan: parsed.data.plan,
    foundingMember: activeSub.foundingMember,
    currentDiscountId: activeSub.paddleDiscountId,
  });

  try {
    const paddle = getPaddle();
    const updated = await paddle.subscriptions.update(
      activeSub.paddleSubscriptionId,
      {
        items,
        customData: customData as unknown as Record<string, string>,
        // Charge (or credit) the prorated delta right now. Paddle
        // handles the math: upgrades see a charge on the saved card,
        // downgrades see a credit applied to the next invoice.
        prorationBillingMode: "prorated_immediately",
        ...(restoreDiscountId
          ? { discount: { id: restoreDiscountId, effectiveFrom: "immediately" as const } }
          : {}),
      },
    );

    const newWorkspaceId =
      parsed.data.plan === "team" ? parsed.data.workspaceId : null;

    // Write Paddle's authoritative response straight into our DB. We
    // don't wait for the webhook because (a) the user is staring at
    // a loading overlay right now and (b) the webhook will replay
    // the same state idempotently when it arrives.
    await db
      .update(subscriptions)
      .set({
        plan: parsed.data.plan,
        workspaceId: newWorkspaceId,
        paddlePriceId: priceId,
        paddleDiscountId: updated.discount?.id ?? null,
        ...(isFounderDiscount(updated.discount?.id) ? { foundingMember: true } : {}),
        billingCycle: parsed.data.cycle,
        seats: quantity,
        extraWorkspaces,
        status: updated.status,
        currentPeriodStart: updated.currentBillingPeriod?.startsAt
          ? new Date(updated.currentBillingPeriod.startsAt)
          : null,
        currentPeriodEnd: updated.currentBillingPeriod?.endsAt
          ? new Date(updated.currentBillingPeriod.endsAt)
          : null,
        cancelAtPeriodEnd:
          updated.scheduledChange?.action === "cancel" ? true : false,
        canceledAt: updated.canceledAt ? new Date(updated.canceledAt) : null,
        updatedAt: sql`now()`,
      })
      .where(
        eq(
          subscriptions.paddleSubscriptionId,
          activeSub.paddleSubscriptionId,
        ),
      );

    // Reconcile denormalized plan columns. Cross-scope switches (Pro ↔
    // Team) need BOTH sides reconciled or we leak a stale value.
    await reconcileUserPlan(userId);
    const workspacesToReconcile = new Set<string>();
    if (newWorkspaceId) workspacesToReconcile.add(newWorkspaceId);
    if (
      activeSub.workspaceId &&
      activeSub.workspaceId !== newWorkspaceId
    ) {
      workspacesToReconcile.add(activeSub.workspaceId);
    }
    for (const wsId of workspacesToReconcile) {
      await reconcileWorkspacePlan(wsId);
    }

    return { ok: true };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[paddle] subscription update failed:", error);
    return { ok: false, error: "paddle_error" };
  }
}

export async function addProWorkspaceAction(): Promise<
  { ok: true; extraWorkspaces: number; workspaceLimit: number } | { ok: false; error: string }
> {
  if (!db) {
    return { ok: false, error: "database_unavailable" };
  }
  try {
    requireBillingConfig();
  } catch {
    return { ok: false, error: "billing_disabled" };
  }

  const session = await requireServerSession();
  const userId = session.user.id;

  const [activeSub] = await db
    .select({
      paddleSubscriptionId: subscriptions.paddleSubscriptionId,
      billingCycle: subscriptions.billingCycle,
      paddlePriceId: subscriptions.paddlePriceId,
      extraWorkspaces: subscriptions.extraWorkspaces,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.plan, "pro"),
        inCurrentBillingEnvironment(),
        inArray(subscriptions.status, [...UPDATABLE_STATUSES]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  if (!activeSub) {
    return { ok: false, error: "no_active_pro_subscription" };
  }

  try {
    const paddle = getPaddle();
    const subscription = await paddle.subscriptions.get(activeSub.paddleSubscriptionId);
    const currentItems = subscription.items as PaddleSubscriptionItem[];
    const currentExtra =
      getProExtraWorkspaceQuantity(currentItems) ||
      Math.max(0, activeSub.extraWorkspaces ?? 0);
    const nextExtra = currentExtra + 1;

    let items = buildSubscriptionItemsWithProWorkspaceAddOn(
      currentItems,
      activeSub.billingCycle,
      nextExtra,
    );

    if (items.length === 1 && items[0]?.priceId !== activeSub.paddlePriceId) {
      items = [
        { priceId: activeSub.paddlePriceId, quantity: 1 },
        { priceId: getProExtraWorkspacePriceId(activeSub.billingCycle), quantity: nextExtra },
      ];
    }

    const updated = await paddle.subscriptions.update(
      activeSub.paddleSubscriptionId,
      {
        items,
        prorationBillingMode: "prorated_immediately",
      },
    );

    const resolvedExtra = getProExtraWorkspaceQuantity(
      updated.items as PaddleSubscriptionItem[],
    );
    const extraWorkspaces = resolvedExtra || nextExtra;

    await db
      .update(subscriptions)
      .set({
        extraWorkspaces,
        paddleDiscountId: updated.discount?.id ?? null,
        status: updated.status,
        currentPeriodStart: updated.currentBillingPeriod?.startsAt
          ? new Date(updated.currentBillingPeriod.startsAt)
          : null,
        currentPeriodEnd: updated.currentBillingPeriod?.endsAt
          ? new Date(updated.currentBillingPeriod.endsAt)
          : null,
        cancelAtPeriodEnd:
          updated.scheduledChange?.action === "cancel" ? true : false,
        canceledAt: updated.canceledAt ? new Date(updated.canceledAt) : null,
        updatedAt: sql`now()`,
      })
      .where(
        eq(
          subscriptions.paddleSubscriptionId,
          activeSub.paddleSubscriptionId,
        ),
      );

    return {
      ok: true,
      extraWorkspaces,
      workspaceLimit: PLAN_LIMITS.pro.workspaces + extraWorkspaces,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[paddle] add pro workspace failed:", error);
    return { ok: false, error: "paddle_error" };
  }
}

/**
 * Lightweight read of current billing state — just the plan and whether
 * a live subscription row exists. The billing page polls this after a
 * successful Paddle checkout because the `subscription.created` webhook
 * can land a second or two after Paddle redirects the browser back to us,
 * and we don't want the user to see "Free" for even a frame.
 *
 * Cheap: the underlying `getBillingState` does two indexed reads
 * (user.plan, workspace.plan) + one subscriptions lookup. Safe to poll
 * at 1Hz.
 */
export interface BillingSnapshot {
  plan: "free" | "pro" | "team";
  hasActiveSubscription: boolean;
}

export async function getBillingSnapshotAction(
  workspaceId: string | null,
): Promise<BillingSnapshot> {
  const session = await requireServerSession();
  const state = await getBillingState(session.user.id, workspaceId);
  return {
    plan: state.effectivePlan,
    hasActiveSubscription: state.subscription !== null,
  };
}

/**
 * Schedules cancellation of the user's active subscription at the end of
 * the current billing period — the standard "downgrade to Free" flow.
 *
 * Paddle behavior with `effectiveFrom: 'next_billing_period'`:
 *   - The subscription keeps status `active` (entitlement stays on).
 *   - `scheduledChange` is set to `{ action: 'cancel', effective_at: periodEnd }`.
 *   - Paddle fires `subscription.updated` now; `subscription.canceled`
 *     when the period actually ends.
 *
 * We mirror that state change locally so the billing page shows
 * "Canceling" / "Access ends …" immediately. The webhook will
 * idempotently re-assert the same row a moment later.
 */
export async function cancelSubscriptionAction(): Promise<
  { ok: true; endsAt: string | null } | { ok: false; error: string }
> {
  if (!db) {
    return { ok: false, error: "database_unavailable" };
  }
  try {
    requireBillingConfig();
  } catch {
    return { ok: false, error: "billing_disabled" };
  }

  const session = await requireServerSession();
  const userId = session.user.id;

  // Find the user's most recent cancelable subscription. `UPDATABLE_STATUSES`
  // is the same set that Paddle accepts for cancel (minus `paused`, which
  // needs to be resumed before canceling — not a flow we expose yet).
  const [activeSub] = await db
    .select({
      paddleSubscriptionId: subscriptions.paddleSubscriptionId,
      workspaceId: subscriptions.workspaceId,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        inCurrentBillingEnvironment(),
        inArray(subscriptions.status, [...UPDATABLE_STATUSES]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  if (!activeSub) {
    return { ok: false, error: "no_active_subscription" };
  }

  try {
    const paddle = getPaddle();
    const canceled = await paddle.subscriptions.cancel(
      activeSub.paddleSubscriptionId,
      { effectiveFrom: "next_billing_period" },
    );

    // Write Paddle's authoritative response immediately so the UI
    // reflects "Canceling" on the next render. Status stays `active`
    // (or whatever Paddle returned — usually unchanged) until the
    // period ends; cancelAtPeriodEnd flips to true.
    await db
      .update(subscriptions)
      .set({
        status: canceled.status,
        cancelAtPeriodEnd:
          canceled.scheduledChange?.action === "cancel" ? true : false,
        canceledAt: canceled.canceledAt ? new Date(canceled.canceledAt) : null,
        currentPeriodStart: canceled.currentBillingPeriod?.startsAt
          ? new Date(canceled.currentBillingPeriod.startsAt)
          : null,
        currentPeriodEnd: canceled.currentBillingPeriod?.endsAt
          ? new Date(canceled.currentBillingPeriod.endsAt)
          : null,
        updatedAt: sql`now()`,
      })
      .where(
        eq(
          subscriptions.paddleSubscriptionId,
          activeSub.paddleSubscriptionId,
        ),
      );

    // Do NOT reconcile user/workspace plan columns here — the user
    // still has entitlement until the period actually ends. The
    // `subscription.canceled` webhook (or a future `subscription.updated`
    // once Paddle flips status to `canceled`) will trigger the
    // reconcile for us.

    return {
      ok: true,
      endsAt: canceled.currentBillingPeriod?.endsAt ?? null,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[paddle] subscription cancel failed:", error);
    return { ok: false, error: "paddle_error" };
  }
}

/**
 * Reverses a pending cancellation — i.e. the subscription was previously
 * scheduled to cancel at period end via `cancelSubscriptionAction` and
 * the user changed their mind. We send `scheduledChange: null` to
 * Paddle, which clears the pending action and the subscription continues
 * normally on its next renewal.
 *
 * Idempotent: if the subscription has no scheduled change, Paddle
 * returns it unchanged and we mirror that back to our DB. Calling this
 * on a sub that's already not-canceling is a safe no-op.
 *
 * No reconcile call needed — entitlement never lapsed during the
 * pending-cancel window, so `user.plan` and `workspaces.plan` are
 * already correct.
 */
export async function resumeSubscriptionAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!db) {
    return { ok: false, error: "database_unavailable" };
  }
  try {
    requireBillingConfig();
  } catch {
    return { ok: false, error: "billing_disabled" };
  }

  const session = await requireServerSession();
  const userId = session.user.id;

  const [activeSub] = await db
    .select({
      paddleSubscriptionId: subscriptions.paddleSubscriptionId,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        inCurrentBillingEnvironment(),
        inArray(subscriptions.status, [...UPDATABLE_STATUSES]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  if (!activeSub) {
    return { ok: false, error: "no_active_subscription" };
  }

  try {
    const paddle = getPaddle();
    const updated = await paddle.subscriptions.update(
      activeSub.paddleSubscriptionId,
      { scheduledChange: null },
    );

    await db
      .update(subscriptions)
      .set({
        status: updated.status,
        cancelAtPeriodEnd:
          updated.scheduledChange?.action === "cancel" ? true : false,
        canceledAt: updated.canceledAt ? new Date(updated.canceledAt) : null,
        currentPeriodStart: updated.currentBillingPeriod?.startsAt
          ? new Date(updated.currentBillingPeriod.startsAt)
          : null,
        currentPeriodEnd: updated.currentBillingPeriod?.endsAt
          ? new Date(updated.currentBillingPeriod.endsAt)
          : null,
        updatedAt: sql`now()`,
      })
      .where(
        eq(
          subscriptions.paddleSubscriptionId,
          activeSub.paddleSubscriptionId,
        ),
      );

    return { ok: true };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[paddle] subscription resume failed:", error);
    return { ok: false, error: "paddle_error" };
  }
}

/**
 * Returns a short-lived signed URL that downloads the invoice PDF for a
 * given Paddle transaction. Meant to back the "Download" link on each
 * invoice row.
 *
 * Authorization: we make sure the transaction belongs to a Paddle
 * customer the signed-in user has at least one subscription with.
 * Without this check, anyone with a valid transaction id could pull
 * someone else's invoice — Paddle's signed URLs don't verify the caller.
 */
export async function getInvoiceDownloadUrlAction(
  transactionId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!db) {
    return { ok: false, error: "database_unavailable" };
  }
  if (typeof transactionId !== "string" || transactionId.trim() === "") {
    return { ok: false, error: "invalid_input" };
  }

  try {
    requireBillingConfig();
  } catch {
    return { ok: false, error: "billing_disabled" };
  }

  const session = await requireServerSession();

  // Collect every Paddle customer id we've ever seen for this user,
  // including legacy workspace-scoped Team subs they purchased.
  const rows = await db
    .select({ paddleCustomerId: subscriptions.paddleCustomerId })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, session.user.id), inCurrentBillingEnvironment()));

  if (rows.length === 0) {
    return { ok: false, error: "no_subscription" };
  }
  const ownedCustomerIds = new Set(rows.map((r) => r.paddleCustomerId));

  try {
    const paddle = getPaddle();
    // Ownership check: fetch the transaction and confirm its customer
    // id matches one of ours. Paddle doesn't let us filter "get" by
    // customer, so we do the check client-side.
    const tx = await paddle.transactions.get(transactionId);
    if (!tx.customerId || !ownedCustomerIds.has(tx.customerId)) {
      return { ok: false, error: "forbidden" };
    }
    const pdf = await paddle.transactions.getInvoicePDF(transactionId);
    return { ok: true, url: pdf.url };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[paddle] invoice PDF fetch failed:", error);
    return { ok: false, error: "paddle_error" };
  }
}

/**
 * Opens a Paddle-hosted customer portal session so the user can manage
 * their billing (update card, view invoices, cancel). Returns the URL
 * to redirect to.
 *
 * Scoped to a specific subscription: the portal session is generated
 * against a Paddle customer and includes links for the passed
 * subscription IDs. If the user has no subscription we return null.
 */
export async function openCustomerPortalAction(): Promise<
  | { ok: true; url: string }
  | { ok: false; error: string }
> {
  if (!db) {
    return { ok: false, error: "database_unavailable" };
  }

  try {
    requireBillingConfig();
  } catch {
    return { ok: false, error: "billing_disabled" };
  }

  const session = await requireServerSession();

  // Find the user's most recent subscription — that's the customer we
  // need to generate a portal session for. A user can have multiple
  // (Pro on self + Team on a workspace they purchased); they all share
  // a Paddle customer id since we don't split customers.
  const rows = await db
    .select({
      paddleCustomerId: subscriptions.paddleCustomerId,
      paddleSubscriptionId: subscriptions.paddleSubscriptionId,
    })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, session.user.id), inCurrentBillingEnvironment()))
    .orderBy(subscriptions.createdAt)
    .limit(10);

  if (rows.length === 0) {
    return { ok: false, error: "no_subscription" };
  }

  // All rows for one user should share a customerId; take the first.
  const customerId = rows[0].paddleCustomerId;
  const subscriptionIds = rows.map((r) => r.paddleSubscriptionId);

  try {
    const paddle = getPaddle();
    const portal = await paddle.customerPortalSessions.create(
      customerId,
      subscriptionIds,
    );
    return { ok: true, url: portal.urls.general.overview };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[paddle] portal session creation failed:", error);
    return { ok: false, error: "paddle_error" };
  }
}
