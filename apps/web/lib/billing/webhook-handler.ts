import "server-only";

import { and, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import type {
  EventEntity,
  SubscriptionCreatedNotification,
  SubscriptionNotification,
  TransactionNotification,
} from "@paddle/paddle-node-sdk";

import { db } from "@opendocs/shared/db";
import {
  paddleWebhookEvents,
  subscriptions,
  user,
} from "@opendocs/shared/db/schema";
import { trackPurchaseConversion } from "@opendocs/ads/server";
import { notifyNewSubscriber } from "@opendocs/shared/notifications/telegram";
import { currentBillingEnvironment } from "@opendocs/shared/billing/environment";
import { isFounderDiscount } from "@opendocs/shared/billing/founder-offer";

import { parseOpendocsCustomData } from "./custom-data";
import { resolvePriceId } from "./config";
import { reconcileUserPlan, reconcileWorkspacePlan } from "./reconcile";

type SubscriptionEventData =
  | SubscriptionNotification
  | SubscriptionCreatedNotification;

const SUBSCRIPTION_EVENT_TYPES = new Set([
  "subscription.created",
  "subscription.activated",
  "subscription.updated",
  "subscription.canceled",
  "subscription.paused",
  "subscription.resumed",
  "subscription.trialing",
  "subscription.past_due",
  "subscription.imported",
]);

/**
 * Applies a verified Paddle webhook event to our domain state.
 *
 * Contract: idempotent and safe to call multiple times with the same
 * event. That's guaranteed by two mechanisms:
 *
 *   1. The route handler inserts a row into `paddle_webhook_events`
 *      keyed on `event_id` before calling us. Paddle retries collapse
 *      to ON CONFLICT DO NOTHING, so we never see a duplicate event_id.
 *   2. Our upserts key on Paddle's own IDs (`paddle_subscription_id`,
 *      userId, workspaceId) so reprocessing an already-applied event
 *      converges to the same row state.
 *
 * Errors thrown from here propagate to the route handler, which returns
 * 500 so Paddle retries. A bad payload (unrecognized customData, unknown
 * priceId) is logged as `processingError` but does NOT throw — we don't
 * want Paddle to retry forever on a permanent error.
 */

if (!db) {
  throw new Error("DATABASE_URL must be set for the billing webhook handler.");
}
const database = db;

async function applySubscriptionEvent(data: SubscriptionEventData): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  // Paddle subscriptions can have multiple items. The base plan item is
  // the entitlement; Pro may also carry an "extra workspace" add-on item.
  const knownItems = data.items
    .map((item) => {
      const priceId = item.price?.id;
      if (!priceId) return null;
      const mapped = resolvePriceId(priceId);
      return mapped ? { priceId, quantity: item.quantity, mapped } : null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  const knownItem = knownItems.find((item) => item.mapped.kind === "plan");
  const proExtraWorkspaceItem = knownItems.find(
    (item) =>
      item.mapped.kind === "addon" &&
      item.mapped.addon === "pro_extra_workspace",
  );

  if (!knownItem || knownItem.mapped.kind !== "plan") {
    // A price we don't map (rotated price ids, an old price). If we know
    // the subscription, still record its status and period, or a
    // cancellation or failed payment would never take effect here.
    const updated = await applyStatusOnly(data);
    if (updated) return { ok: true };
    return {
      ok: false,
      reason: `No subscription item with a known price id. items=${JSON.stringify(
        data.items.map((i) => i.price?.id),
      )}`,
    };
  }

  const customData = parseOpendocsCustomData(data.customData);
  if (!customData) {
    return {
      ok: false,
      reason:
        "custom_data missing or malformed — cannot attribute subscription to an OpenDocs account.",
    };
  }

  const { plan, cycle } = knownItem.mapped;
  const extraWorkspaces =
    plan === "pro" ? Math.max(0, proExtraWorkspaceItem?.quantity ?? 0) : 0;

  // Pro is always user-scoped. Team is user-scoped for new checkouts, but
  // legacy workspace-scoped Team webhooks are still accepted so existing
  // customers converge cleanly during migration.
  if (plan === "pro" && customData.opendocsScope !== "user") {
    return {
      ok: false,
      reason: `Pro subscription ${data.id} has scope "${customData.opendocsScope}"; expected "user".`,
    };
  }

  const workspaceId =
    customData.opendocsScope === "workspace" ? customData.workspaceId : null;
  const userId = customData.userId;

  // The discount as Paddle has it now. A founder discount also marks the
  // subscription as a founding member for good (never unset here).
  const paddleDiscountId = data.discount?.id ?? null;
  const foundingMember = isFounderDiscount(paddleDiscountId);

  // Capture the old scope BEFORE the upsert. If a subscription's scope
  // has shifted (e.g. Pro → Team flips userId stays same but workspaceId
  // now gets set), we need to reconcile the OLD scope too or the
  // denormalized plan cache goes stale.
  const [oldRow] = await database
    .select({
      userId: subscriptions.userId,
      workspaceId: subscriptions.workspaceId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.paddleSubscriptionId, data.id))
    .limit(1);

  // Upsert the subscription row — Drizzle onConflict is on
  // paddle_subscription_id so Paddle retries (or our own in-app plan
  // change) converge to the same row state.
  await database
    .insert(subscriptions)
    .values({
      userId,
      workspaceId,
      plan,
      paddleCustomerId: data.customerId,
      paddleSubscriptionId: data.id,
      environment: currentBillingEnvironment(),
      paddlePriceId: knownItem.priceId,
      paddleDiscountId,
      foundingMember,
      billingCycle: cycle,
      status: data.status,
      seats: knownItem.quantity,
      extraWorkspaces,
      currentPeriodStart: data.currentBillingPeriod?.startsAt
        ? new Date(data.currentBillingPeriod.startsAt)
        : null,
      currentPeriodEnd: data.currentBillingPeriod?.endsAt
        ? new Date(data.currentBillingPeriod.endsAt)
        : null,
      cancelAtPeriodEnd:
        data.scheduledChange?.action === "cancel" ? true : false,
      canceledAt: data.canceledAt ? new Date(data.canceledAt) : null,
    })
    .onConflictDoUpdate({
      target: subscriptions.paddleSubscriptionId,
      set: {
        userId,
        workspaceId,
        plan,
        environment: currentBillingEnvironment(),
        paddleCustomerId: data.customerId,
        paddlePriceId: knownItem.priceId,
        paddleDiscountId,
        ...(foundingMember ? { foundingMember: true } : {}),
        billingCycle: cycle,
        status: data.status,
        seats: knownItem.quantity,
        extraWorkspaces,
        currentPeriodStart: data.currentBillingPeriod?.startsAt
          ? new Date(data.currentBillingPeriod.startsAt)
          : null,
        currentPeriodEnd: data.currentBillingPeriod?.endsAt
          ? new Date(data.currentBillingPeriod.endsAt)
          : null,
        cancelAtPeriodEnd:
          data.scheduledChange?.action === "cancel" ? true : false,
        canceledAt: data.canceledAt ? new Date(data.canceledAt) : null,
        updatedAt: sql`now()`,
      },
    });

  // Recompute the denormalized plan columns from the current set of
  // live subscriptions. Reconciling (rather than direct assignment)
  // handles every transition cleanly: initial upgrade, cancellation,
  // plan-type change, scope change — we just ask "given the current
  // subs table, what plan does this user/workspace have?".
  //
  // `past_due` and `paused` still count as entitled; only `canceled`
  // drops them. See reconcile.ts for the exact status set.
  const usersToReconcile = new Set<string>([userId]);
  if (oldRow?.userId && oldRow.userId !== userId) {
    usersToReconcile.add(oldRow.userId);
  }
  const workspacesToReconcile = new Set<string>();
  if (workspaceId) workspacesToReconcile.add(workspaceId);
  if (oldRow?.workspaceId && oldRow.workspaceId !== workspaceId) {
    workspacesToReconcile.add(oldRow.workspaceId);
  }

  for (const uid of usersToReconcile) await reconcileUserPlan(uid);
  for (const wsId of workspacesToReconcile) await reconcileWorkspacePlan(wsId);

  return { ok: true };
}

/**
 * Marks the corresponding `paddle_webhook_events` row as processed.
 * Called after the event's business logic succeeds. If the logic threw
 * and propagated out, the row keeps `processed_at = null` and Paddle's
 * retry will pick it up.
 */
/** Status, period and cancellation for a subscription we already have. */
async function applyStatusOnly(data: SubscriptionEventData): Promise<boolean> {
  const rows = await database
    .update(subscriptions)
    .set({
      status: data.status,
      paddleDiscountId: data.discount?.id ?? null,
      ...(isFounderDiscount(data.discount?.id) ? { foundingMember: true } : {}),
      currentPeriodStart: data.currentBillingPeriod?.startsAt
        ? new Date(data.currentBillingPeriod.startsAt)
        : null,
      currentPeriodEnd: data.currentBillingPeriod?.endsAt
        ? new Date(data.currentBillingPeriod.endsAt)
        : null,
      cancelAtPeriodEnd: data.scheduledChange?.action === "cancel",
      canceledAt: data.canceledAt ? new Date(data.canceledAt) : null,
      updatedAt: sql`now()`,
    })
    .where(eq(subscriptions.paddleSubscriptionId, data.id))
    .returning({ userId: subscriptions.userId, workspaceId: subscriptions.workspaceId });
  if (rows.length === 0) return false;
  for (const row of rows) {
    if (row.userId) await reconcileUserPlan(row.userId);
    if (row.workspaceId) await reconcileWorkspacePlan(row.workspaceId);
  }
  return true;
}

/**
 * Paddle doesn't guarantee delivery order, and retries and replays can
 * deliver an old event after a newer one. Each event carries the whole
 * subscription, so applying an older one would roll the row back (a
 * cancelled subscription back to active, say).
 */
async function hasNewerSubscriptionEvent(event: EventEntity, subscriptionId: string): Promise<boolean> {
  const [newer] = await database
    .select({ eventId: paddleWebhookEvents.eventId })
    .from(paddleWebhookEvents)
    .where(
      and(
        sql`${paddleWebhookEvents.eventType} like 'subscription.%'`,
        sql`${paddleWebhookEvents.payload} -> 'data' ->> 'id' = ${subscriptionId}`,
        gt(paddleWebhookEvents.occurredAt, new Date(event.occurredAt)),
        isNotNull(paddleWebhookEvents.processedAt),
        ne(paddleWebhookEvents.eventId, event.eventId),
      ),
    )
    .limit(1);
  return Boolean(newer);
}

async function markProcessed(eventId: string, error?: string) {
  await database
    .update(paddleWebhookEvents)
    .set({
      processedAt: error ? null : new Date(),
      processingError: error ?? null,
    })
    .where(eq(paddleWebhookEvents.eventId, eventId));
}

// A new subscription's first payment: counted as a Meta conversion, and
// the owner hears about it on Telegram.
async function announceNewSubscription(input: {
  eventId: string;
  customData: unknown;
  items: Array<{ price?: { id?: string | null } | null; quantity: number }>;
  subscriptionId: string;
  value?: number;
  currency?: string;
}) {
  const customData = parseOpendocsCustomData(input.customData);
  if (!customData) return;
  const [currentUser] = await database
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, customData.userId))
    .limit(1);
  if (!currentUser?.email) return;
  const knownItem = input.items
    .map((item) => {
      const priceId = item.price?.id;
      if (!priceId) return null;
      const mapped = resolvePriceId(priceId);
      return mapped ? { quantity: item.quantity, mapped } : null;
    })
    .find((v): v is NonNullable<typeof v> => v !== null && v.mapped.kind === "plan");

  const plan = knownItem?.mapped.kind === "plan" ? knownItem.mapped.plan : undefined;
  await notifyNewSubscriber({
    email: currentUser.email,
    plan,
    cycle: knownItem?.mapped.cycle,
    seats: knownItem?.quantity,
    amount: input.value,
    currency: input.currency,
  });
  await trackPurchaseConversion({
    eventId: input.eventId,
    email: currentUser.email,
    userId: customData.userId,
    plan,
    cycle: knownItem?.mapped.cycle,
    seats: knownItem?.quantity,
    subscriptionId: input.subscriptionId,
    value: input.value,
    currency: input.currency,
  });
}

async function markSkipped(eventId: string, reason: string) {
  await database
    .update(paddleWebhookEvents)
    .set({ processedAt: new Date(), processingError: `skipped: ${reason}` })
    .where(eq(paddleWebhookEvents.eventId, eventId));
}

export async function processWebhookEvent(event: EventEntity): Promise<void> {
  // A redelivery of an event we already applied (Paddle retries until it
  // sees a 2xx, and events can be replayed from its dashboard).
  const [stored] = await database
    .select({ processedAt: paddleWebhookEvents.processedAt })
    .from(paddleWebhookEvents)
    .where(eq(paddleWebhookEvents.eventId, event.eventId))
    .limit(1);
  if (stored?.processedAt) return;

  if (SUBSCRIPTION_EVENT_TYPES.has(event.eventType)) {
    const subscriptionId = (event.data as SubscriptionEventData).id;
    const stale = await hasNewerSubscriptionEvent(event, subscriptionId);
    // All subscription.* events carry a Subscription(Created)Notification
    // — the union wrapper in EventEntity is too broad for TS to narrow
    // automatically through the Set check, so we assert here. The
    // runtime guarantee comes from the Set contents.
    const result = stale
      ? ({ ok: true } as const)
      : await applySubscriptionEvent(event.data as SubscriptionEventData);
    if (!result.ok) {
      // Permanent error — log it so we can see what went wrong, but
      // DO NOT throw (that would trigger infinite Paddle retries).
      await markProcessed(event.eventId, result.reason);
      // eslint-disable-next-line no-console
      console.warn(
        `[paddle-webhook] skipping ${event.eventType} ${event.eventId}: ${result.reason}`,
      );
      return;
    }
    if (stale) {
      await markSkipped(event.eventId, "a newer event for this subscription was already applied");
    } else {
      await markProcessed(event.eventId);
    }
    return;
  }

  if (event.eventType === "transaction.completed") {
    await markProcessed(event.eventId);
    const txn = event.data as TransactionNotification;
    // The first payment for a new subscription: the checkout transaction
    // we create (origin "api") or one Paddle.js started ("web"). Renewals
    // and plan changes have other origins. Paddle rarely sends
    // subscription.created, so this is where a purchase is counted, with
    // the browser pixel's event id so Meta counts it once.
    if (txn.subscriptionId && (txn.origin === "api" || txn.origin === "web")) {
      // What was charged before tax: a founding member's $4, not the list $8.
      const subtotal =
        Number(txn.details?.totals?.subtotal) -
        Number(txn.details?.totals?.discount ?? 0);
      await announceNewSubscription({
        eventId: `checkout:${txn.id}`,
        customData: txn.customData,
        items: txn.items,
        subscriptionId: txn.subscriptionId,
        value: Number.isFinite(subtotal) ? subtotal / 100 : undefined,
        currency: txn.currencyCode,
      });
    }
    return;
  }

  // We received an event type we don't handle yet (transaction.*,
  // customer.*, adjustment.*, etc.). Mark it processed so the row
  // doesn't look stuck — we still have the raw payload if we need
  // to revisit later.
  await markProcessed(event.eventId);
}
