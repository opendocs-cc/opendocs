import { describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

import { db as database } from "@opendocs/shared/db";
import * as schema from "@opendocs/shared/db/schema";
import {
  getEffectiveWorkspaceTier,
  getUserEffectiveBillingTier,
  getUserWorkspaceLimit,
} from "@opendocs/shared/workspaces/service";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";

type Onboarded = Awaited<ReturnType<typeof createOnboardedUser>>;

function db() {
  if (!database) throw new Error("Database is not initialized.");
  return database;
}

async function insertTeamSubscription(input: { userId: string; workspaceId: string | null }) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await db().insert(schema.subscriptions).values({
    userId: input.userId,
    workspaceId: input.workspaceId,
    plan: "team",
    paddleCustomerId: `ctm_${suffix}`,
    paddleSubscriptionId: `sub_${suffix}`,
    paddlePriceId: `pri_team_${suffix}`,
    billingCycle: "monthly",
    status: "active",
    seats: 3,
    extraWorkspaces: 0,
  });
}

async function addMember(workspaceId: string, member: Onboarded) {
  await db().insert(schema.workspaceMembers).values({
    workspaceId,
    userId: member.userId,
    role: "member",
    status: "active",
  });
}

async function setCompedTier(userId: string, compedTier: string | null) {
  await db().update(schema.user).set({ compedTier }).where(eq(schema.user.id, userId));
}

describe("workspace plans follow ownership", () => {
  it("a member of a legacy workspace-scoped Team workspace gets Team there, not in their own workspace", async () => {
    const owner = await createOnboardedUser();
    const member = await createOnboardedUser();
    await insertTeamSubscription({ userId: owner.userId, workspaceId: owner.workspaceId });
    await db().update(schema.workspaces).set({ plan: "team" }).where(eq(schema.workspaces.id, owner.workspaceId));
    await addMember(owner.workspaceId, member);

    expect(await getEffectiveWorkspaceTier(owner.workspaceId)).toBe("team");
    expect(await getEffectiveWorkspaceTier(member.workspaceId)).toBe("free");
    expect(await getUserEffectiveBillingTier(member.userId)).toBe("free");
    expect((await getUserWorkspaceLimit(member.userId)).tier).toBe("free");

    // Word export is a paid feature of the workspace, so the member can't
    // use it in their own.
    const app = await getTestApp();
    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(member.apiKey))
      .send({ workspaceId: member.workspaceId, markdown: "# Notes\n\nMine." });
    expect(published.status).toBe(201);
    const docx = await request(app)
      .post(`/api/v1/posts/${published.body.postId}/export/docx`)
      .set(authHeaders(member.apiKey))
      .send({ workspaceId: member.workspaceId });
    expect(docx.status).toBe(403);
    expect(docx.body.error).toBe("docx_requires_pro");
  });

  it("a Team subscriber's workspaces are Team for their members, and only there", async () => {
    const subscriber = await createOnboardedUser();
    const member = await createOnboardedUser();
    await insertTeamSubscription({ userId: subscriber.userId, workspaceId: null });
    await addMember(subscriber.workspaceId, member);

    expect(await getUserEffectiveBillingTier(subscriber.userId)).toBe("team");
    expect(await getEffectiveWorkspaceTier(subscriber.workspaceId)).toBe("team");
    expect(await getEffectiveWorkspaceTier(member.workspaceId)).toBe("free");
    expect(await getUserEffectiveBillingTier(member.userId)).toBe("free");
  });

  it("complimentary access upgrades the workspaces the user owns, not ones they're a member of", async () => {
    const creator = await createOnboardedUser();
    const friend = await createOnboardedUser();
    const host = await createOnboardedUser();
    await setCompedTier(creator.userId, "creator");
    await setCompedTier(friend.userId, "friends");
    await addMember(host.workspaceId, creator);
    await addMember(host.workspaceId, friend);

    expect(await getEffectiveWorkspaceTier(creator.workspaceId)).toBe("team");
    expect(await getEffectiveWorkspaceTier(friend.workspaceId)).toBe("pro");
    expect(await getEffectiveWorkspaceTier(host.workspaceId)).toBe("free");
  });
});
