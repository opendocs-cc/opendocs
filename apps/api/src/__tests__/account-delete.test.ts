import { describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";

async function getDb() {
  const { db } = await import("@opendocs/shared/db");
  if (!db) throw new Error("Database is not initialized.");
  return db;
}

async function getSchema() {
  return import("@opendocs/shared/db/schema");
}

describe("DELETE /api/v1/account", () => {
  it("deletes the user, cascades workspace/posts, and writes an audit row", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({
        title: "Doomed Doc",
        markdown: "# goodbye",
        workspaceId: user.workspaceId,
        visibility: "workspace",
      });
    expect(published.status).toBe(201);
    const postId = published.body.postId as string;

    const check = await user.agent.get("/api/v1/account/delete-check");
    expect(check.status).toBe(200);
    expect(check.body).toEqual({ canDelete: true });

    const res = await user.agent.delete("/api/v1/account");
    expect(res.status).toBe(204);

    const db = await getDb();
    const {
      user: userTable,
      session,
      workspaces,
      posts,
      auditEvents,
    } = await getSchema();

    const [userRow] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, user.userId));
    expect(userRow).toBeUndefined();

    const sessions = await db
      .select({ id: session.id })
      .from(session)
      .where(eq(session.userId, user.userId));
    expect(sessions).toHaveLength(0);

    const workspaceRows = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, user.workspaceId));
    expect(workspaceRows).toHaveLength(0);

    const postRows = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.id, postId));
    expect(postRows).toHaveLength(0);

    const auditRows = await db
      .select({
        actorUserId: auditEvents.actorUserId,
        eventType: auditEvents.eventType,
        metadata: auditEvents.metadata,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "deleted"),
          sql`${auditEvents.metadata}->>'email' = ${user.email}`,
        ),
      );
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].actorUserId).toBeNull();
    expect((auditRows[0].metadata as { reason?: string })?.reason).toBe("self_delete");
  });

  it("blocks deletion when the user has an active subscription", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();

    const db = await getDb();
    const { subscriptions } = await getSchema();
    await db.insert(subscriptions).values({
      userId: user.userId,
      plan: "pro",
      paddleCustomerId: `ctm_${Date.now()}`,
      paddleSubscriptionId: `sub_${Date.now()}`,
      paddlePriceId: "pri_test",
      billingCycle: "monthly",
      status: "active",
    });

    const check = await user.agent.get("/api/v1/account/delete-check");
    expect(check.status).toBe(200);
    expect(check.body.canDelete).toBe(false);
    expect(check.body.reason).toBe("active_plan");

    const res = await user.agent.delete("/api/v1/account");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("active_plan");

    const { user: userTable } = await getSchema();
    const [userRow] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, user.userId));
    expect(userRow?.id).toBe(user.userId);

    // Use the public unpublish endpoint to avoid touching Paddle — we're
    // only exercising the gate.
    await request(app)
      .delete(`/api/v1/posts/${user.workspaceId}`)
      .set(authHeaders(user.apiKey))
      .catch(() => {});
  });

  it("blocks deletion when an active sub is cancel_at_period_end", async () => {
    const user = await createOnboardedUser();

    const db = await getDb();
    const { subscriptions } = await getSchema();
    await db.insert(subscriptions).values({
      userId: user.userId,
      plan: "pro",
      paddleCustomerId: `ctm_${Date.now()}`,
      paddleSubscriptionId: `sub_${Date.now()}`,
      paddlePriceId: "pri_test",
      billingCycle: "monthly",
      status: "active",
      cancelAtPeriodEnd: true,
    });

    const res = await user.agent.delete("/api/v1/account");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("active_plan");
  });

  it("allows deletion when the only subscription is fully canceled", async () => {
    const user = await createOnboardedUser();

    const db = await getDb();
    const { subscriptions } = await getSchema();
    await db.insert(subscriptions).values({
      userId: user.userId,
      plan: "pro",
      paddleCustomerId: `ctm_${Date.now()}`,
      paddleSubscriptionId: `sub_${Date.now()}`,
      paddlePriceId: "pri_test",
      billingCycle: "monthly",
      status: "canceled",
    });

    const res = await user.agent.delete("/api/v1/account");
    expect(res.status).toBe(204);
  });

  it("blocks deletion when the user owns a team workspace with other active members", async () => {
    const owner = await createOnboardedUser();
    const teammate = await createOnboardedUser();

    const db = await getDb();
    const { workspaces, workspaceMembers } = await getSchema();
    await db
      .update(workspaces)
      .set({ plan: "team" })
      .where(eq(workspaces.id, owner.workspaceId));
    await db.insert(workspaceMembers).values({
      workspaceId: owner.workspaceId,
      userId: teammate.userId,
      role: "member",
      status: "active",
    });

    const check = await owner.agent.get("/api/v1/account/delete-check");
    expect(check.status).toBe(200);
    expect(check.body.canDelete).toBe(false);
    expect(check.body.reason).toBe("team_workspace_with_members");
    expect(check.body.workspaces).toHaveLength(1);
    expect(check.body.workspaces[0].id).toBe(owner.workspaceId);
    expect(check.body.workspaces[0].name).toBe(owner.workspaceName);
    expect(check.body.workspaces[0].memberCount).toBe(1);

    const res = await owner.agent.delete("/api/v1/account");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("team_workspace_with_members");
  });

  it("allows deletion for a solo team-plan workspace (owner is the only member)", async () => {
    const owner = await createOnboardedUser();

    const db = await getDb();
    const { workspaces } = await getSchema();
    await db
      .update(workspaces)
      .set({ plan: "team" })
      .where(eq(workspaces.id, owner.workspaceId));

    const res = await owner.agent.delete("/api/v1/account");
    expect(res.status).toBe(204);
  });

  it("rejects API-key auth on DELETE /account (session-only)", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();

    const res = await request(app)
      .delete("/api/v1/account")
      .set(authHeaders(user.apiKey));
    expect(res.status).toBe(401);

    const checkRes = await request(app)
      .get("/api/v1/account/delete-check")
      .set(authHeaders(user.apiKey));
    expect(checkRes.status).toBe(401);

    const { user: userTable } = await getSchema();
    const db = await getDb();
    const [userRow] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, user.userId));
    expect(userRow?.id).toBe(user.userId);
  });
});
