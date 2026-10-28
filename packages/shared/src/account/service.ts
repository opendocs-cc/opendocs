import { and, eq, inArray, ne, or, sql } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import {
  auditEvents,
  posts,
  subscriptions,
  user,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { inCurrentBillingEnvironment } from "../billing/environment";
import { releaseUnusedBilling } from "../workspaces/service";

// Paddle subscription statuses that still grant entitlement. A user with
// a sub in any of these states is considered to have an "active plan"
// and is blocked from deleting their account. `cancel_at_period_end`
// stays "active" until the period rolls over, so it falls under this
// gate by design — we don't want to delete someone who's still paid up.
const LIVE_SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "paused",
] as const;

export type DeleteAccountCheck =
  | { canDelete: true }
  | {
      canDelete: false;
      reason: "active_plan";
    }
  | {
      canDelete: false;
      reason: "team_workspace_with_members";
      workspaces: Array<{ id: string; name: string; memberCount: number }>;
    };

export class AccountDeletionBlockedError extends Error {
  readonly check: Exclude<DeleteAccountCheck, { canDelete: true }>;

  constructor(check: Exclude<DeleteAccountCheck, { canDelete: true }>) {
    super(`Account deletion blocked: ${check.reason}`);
    this.check = check;
    this.name = "AccountDeletionBlockedError";
  }
}

type DbClient = ReturnType<typeof getDbOrThrow>;
type TxClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

async function runChecks(
  client: DbClient | TxClient,
  userId: string,
): Promise<DeleteAccountCheck> {
  // Active subscription — either the user holds it personally (Pro/Team)
  // or they own a legacy workspace that holds it (old Team model). The
  // workspace-scoped check has to join to `workspaces` because
  // `subscriptions.userId` is the purchaser, not necessarily the owner.
  const [activeSub] = await client
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .leftJoin(workspaces, eq(workspaces.id, subscriptions.workspaceId))
    .where(
      and(
        inCurrentBillingEnvironment(),
        inArray(subscriptions.status, [...LIVE_SUBSCRIPTION_STATUSES]),
        sql`(${subscriptions.userId} = ${userId} OR ${workspaces.ownerUserId} = ${userId})`,
      ),
    )
    .limit(1);

  if (activeSub) {
    return { canDelete: false, reason: "active_plan" };
  }

  // Team workspaces with other active members — ownership transfer isn't
  // supported, so cascade-deleting the workspace would destroy the team's
  // work. Block and ask them to remove members (or delete the workspace)
  // first. Workspaces where the owner is the only member are fine to
  // cascade-delete along with the account.
  const teamWorkspacesWithMembers = await client
    .select({
      id: workspaces.id,
      name: workspaces.name,
      memberCount: sql<number>`cast(count(${workspaceMembers.id}) as int)`,
    })
    .from(workspaces)
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, workspaces.id),
        eq(workspaceMembers.status, "active"),
        ne(workspaceMembers.userId, userId),
      ),
    )
    .where(
      and(
        eq(workspaces.ownerUserId, userId),
        eq(workspaces.plan, "team"),
      ),
    )
    .groupBy(workspaces.id);

  if (teamWorkspacesWithMembers.length > 0) {
    return {
      canDelete: false,
      reason: "team_workspace_with_members",
      workspaces: teamWorkspacesWithMembers,
    };
  }

  return { canDelete: true };
}

export async function checkCanDeleteAccount(
  userId: string,
): Promise<DeleteAccountCheck> {
  const database = getDbOrThrow();
  return runChecks(database, userId);
}

/**
 * Deletes the user and everything that cascades from them — sessions,
 * OAuth accounts, usernames, owned workspaces (and every post/version/
 * tag/member through the workspace cascade), and personal API keys.
 * `subscriptions.userId` / `.workspaceId` are `ON DELETE SET NULL`, so
 * canceled billing history is retained for our records.
 *
 * `posts` rows are deleted explicitly up-front. Both `posts.authorUserId`
 * and `usernames.userId` cascade from the user, but `posts.usernameId`
 * is `ON DELETE RESTRICT`. Deleting posts first avoids any FK
 * evaluation-order ambiguity between the two parallel cascades.
 *
 * R2 avatar blobs (`users/<userId>/avatar.*`) are intentionally NOT
 * deleted — the storage layer has no list-objects helper and adding
 * one is out of scope here. The orphan is harmless and cheap to carry.
 */
export async function deleteAccount(userId: string): Promise<void> {
  return deleteAccountInternal(userId, { bypassChecks: false, reason: "self_delete" });
}

/**
 * Admin override: deletes the account without running the safety checks.
 * For the operator's own admin tools (nothing in this repository calls
 * it) — if an admin is deleting someone, they've already decided the
 * policy questions (active sub, team workspace with members) should be
 * overridden.
 *
 * Still records an audit event, but tags it with `reason: "admin_delete"`
 * so the trail is distinguishable from a self-delete. Callers are
 * expected to cancel any orphaned Paddle subscriptions out-of-band;
 * `subscriptions.userId` is `ON DELETE SET NULL` so the rows survive
 * with a null FK and can be reconciled later.
 */
export async function deleteAccountAsAdmin(userId: string): Promise<void> {
  return deleteAccountInternal(userId, { bypassChecks: true, reason: "admin_delete" });
}

async function deleteAccountInternal(
  userId: string,
  opts: { bypassChecks: boolean; reason: "self_delete" | "admin_delete" },
): Promise<void> {
  const database = getDbOrThrow();

  const [userRow] = await database
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!userRow) {
    throw new Error(`User ${userId} not found`);
  }

  // Owners of workspaces this person belongs to: their Team seats drop
  // once the membership goes with the account.
  const ownersToRelease = await database
    .selectDistinct({ ownerUserId: workspaces.ownerUserId })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), ne(workspaces.ownerUserId, userId)));

  await database.transaction(async (tx) => {
    if (!opts.bypassChecks) {
      const check = await runChecks(tx, userId);
      if (!check.canDelete) {
        throw new AccountDeletionBlockedError(check);
      }
    }

    // Clear pre-existing audit events tied to the user or their
    // workspaces. Both `auditEvents.actorUserId` and
    // `auditEvents.workspaceId` are `ON DELETE SET NULL`, but because
    // the user delete cascades to both the user and their workspaces,
    // those SET NULL cascades fire in parallel. Postgres re-validates
    // every FK on a row when any column is updated — so the cascade
    // update of `actor_user_id` triggers a recheck of `workspace_id`,
    // which now points at the just-deleted workspace and fails. We
    // sidestep the whole ordering problem by wiping these audit rows
    // first. The "published" / "updated" / etc. events are personal
    // data anyway, so clearing them is GDPR-aligned.
    const ownedWorkspaceIds = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, userId));

    if (ownedWorkspaceIds.length > 0) {
      await tx.delete(auditEvents).where(
        or(
          eq(auditEvents.actorUserId, userId),
          inArray(
            auditEvents.workspaceId,
            ownedWorkspaceIds.map((w) => w.id),
          ),
        ),
      );
    } else {
      await tx
        .delete(auditEvents)
        .where(eq(auditEvents.actorUserId, userId));
    }

    // Record the deletion itself. `actorUserId` is `ON DELETE SET NULL`,
    // so this row survives after the user is gone; we store the email
    // in metadata so the record stays interpretable. No workspaceId —
    // keeps the row independent of any cascade.
    await tx.insert(auditEvents).values({
      actorUserId: userId,
      eventType: "deleted",
      metadata: {
        email: userRow.email,
        reason: opts.reason,
      },
    });

    await tx.delete(posts).where(eq(posts.authorUserId, userId));
    await tx.delete(user).where(eq(user.id, userId));
  });

  for (const { ownerUserId } of ownersToRelease) {
    await releaseUnusedBilling(ownerUserId);
  }
}
