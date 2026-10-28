import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@opendocs/shared/db";
import { subscriptions, user, workspaces } from "@opendocs/shared/db/schema";
import { inCurrentBillingEnvironment } from "@opendocs/shared/billing/environment";

/**
 * Reconciliation for the denormalized `user.plan` and `workspaces.plan`
 * columns. The source of truth for entitlement is the `subscriptions`
 * table — joining that on every entitlement check would be slow, so we
 * mirror "is this user/workspace on a paid plan?" into a column that's
 * fast to read.
 *
 * Any code path that mutates a subscription row (webhook handler,
 * in-app plan change action) should call these functions for the
 * userId and workspaceId involved, including the OLD scope if the
 * subscription's scope changed. The functions are cheap and idempotent.
 */

/** Statuses that grant entitlement — everything except `canceled`. */
const LIVE_STATUSES = ["active", "trialing", "past_due", "paused"] as const;

if (!db) {
  throw new Error(
    "DATABASE_URL must be set to use billing reconciliation helpers.",
  );
}
const database = db;

export async function reconcileUserPlan(userId: string): Promise<void> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.plan, "pro"),
        inCurrentBillingEnvironment(),
        inArray(subscriptions.status, LIVE_STATUSES),
      ),
    );
  const hasPro = (row?.count ?? 0) > 0;
  await database
    .update(user)
    .set({ plan: hasPro ? "pro" : "free", updatedAt: sql`now()` })
    .where(eq(user.id, userId));
}

export async function reconcileWorkspacePlan(
  workspaceId: string,
): Promise<void> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        eq(subscriptions.plan, "team"),
        inCurrentBillingEnvironment(),
        inArray(subscriptions.status, LIVE_STATUSES),
      ),
    );
  const hasTeam = (row?.count ?? 0) > 0;
  await database
    .update(workspaces)
    .set({ plan: hasTeam ? "team" : "free", updatedAt: sql`now()` })
    .where(eq(workspaces.id, workspaceId));
}
