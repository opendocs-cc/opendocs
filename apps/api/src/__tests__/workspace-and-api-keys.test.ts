import { describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

import { MAX_DIRECT_IMAGE_UPLOAD_BYTES } from "@opendocs/shared/storage/r2";
import { authHeaders, createOnboardedUser, createSessionAgent, getTestApp } from "../test-helpers/api";

async function setUserPlan(userId: string, plan: "free" | "pro") {
  const [{ db }, { user }] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
  ]);
  if (!db) throw new Error("Database is not initialized.");
  await db.update(user).set({ plan }).where(eq(user.id, userId));
}

async function insertSubscription(input: {
  userId: string;
  plan: "pro" | "team";
  extraWorkspaces?: number;
  seats?: number;
}) {
  const [{ db }, { subscriptions }] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
  ]);
  if (!db) throw new Error("Database is not initialized.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await db.insert(subscriptions).values({
    userId: input.userId,
    workspaceId: null,
    plan: input.plan,
    paddleCustomerId: `ctm_${suffix}`,
    paddleSubscriptionId: `sub_${suffix}`,
    paddlePriceId: `pri_${input.plan}_${suffix}`,
    billingCycle: "monthly",
    status: "active",
    seats: input.seats ?? 1,
    extraWorkspaces: input.extraWorkspaces ?? 0,
  });
}

describe("workspace and api key routes", () => {
  it("enforces Pro workspace capacity, including paid extra workspace add-ons", async () => {
    const owner = await createOnboardedUser();

    const freeSecond = await owner.agent.post("/api/v1/workspaces").send({
      name: "Free Second",
      slug: `free-second-${Date.now().toString(36)}`,
    });
    expect(freeSecond.status).toBe(403);
    expect(freeSecond.body.error).toBe("plan_limit");

    await setUserPlan(owner.userId, "pro");

    const second = await owner.agent.post("/api/v1/workspaces").send({
      name: "Pro Second",
      slug: `pro-second-${Date.now().toString(36)}`,
    });
    expect(second.status).toBe(201);

    const thirdWithoutAddon = await owner.agent.post("/api/v1/workspaces").send({
      name: "Pro Third",
      slug: `pro-third-a-${Date.now().toString(36)}`,
    });
    expect(thirdWithoutAddon.status).toBe(403);
    expect(thirdWithoutAddon.body).toMatchObject({
      error: "plan_limit",
      plan: "pro",
      limit: 2,
    });

    await insertSubscription({
      userId: owner.userId,
      plan: "pro",
      extraWorkspaces: 1,
    });

    const thirdWithAddon = await owner.agent.post("/api/v1/workspaces").send({
      name: "Pro Third With Addon",
      slug: `pro-third-b-${Date.now().toString(36)}`,
    });
    expect(thirdWithAddon.status).toBe(201);

    const fourth = await owner.agent.post("/api/v1/workspaces").send({
      name: "Pro Fourth",
      slug: `pro-fourth-${Date.now().toString(36)}`,
    });
    expect(fourth.status).toBe(403);
    expect(fourth.body).toMatchObject({
      error: "plan_limit",
      plan: "pro",
      limit: 3,
    });
  });

  it("treats user-scoped Team subscriptions as unlimited across newly-created workspaces", async () => {
    const owner = await createOnboardedUser();
    await insertSubscription({
      userId: owner.userId,
      plan: "team",
      seats: 3,
    });

    for (const index of [1, 2, 3]) {
      const res = await owner.agent.post("/api/v1/workspaces").send({
        name: `Team Workspace ${index}`,
        slug: `team-ws-${index}-${Date.now().toString(36)}`,
      });
      expect(res.status).toBe(201);
    }
  });

  it("persists team invite onboarding dismissal per user", async () => {
    const firstUser = await createOnboardedUser();
    const secondUser = await createOnboardedUser();
    const {
      dismissTeamInviteOnboarding,
      getTeamInviteOnboardingDismissedAt,
    } = await import("@opendocs/shared/workspaces/service");

    await expect(
      getTeamInviteOnboardingDismissedAt(firstUser.userId),
    ).resolves.toBeNull();
    await expect(
      getTeamInviteOnboardingDismissedAt(secondUser.userId),
    ).resolves.toBeNull();

    const dismissedAt = await dismissTeamInviteOnboarding(firstUser.userId);
    expect(dismissedAt).toBeInstanceOf(Date);

    await expect(
      getTeamInviteOnboardingDismissedAt(firstUser.userId),
    ).resolves.toBeInstanceOf(Date);
    await expect(
      getTeamInviteOnboardingDismissedAt(secondUser.userId),
    ).resolves.toBeNull();
  });

  it("deletes a workspace only for the owner, with confirmation and a replacement workspace", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    const otherUser = await createSessionAgent();
    await setUserPlan(owner.userId, "pro");

    const blockedLastWorkspace = await owner.agent.delete("/api/v1/workspace").send({
      workspaceId: owner.workspaceId,
      confirmSlug: owner.workspaceSlug,
    });
    expect(blockedLastWorkspace.status).toBe(409);
    expect(blockedLastWorkspace.body).toMatchObject({ error: "last_workspace" });

    const secondWorkspace = await owner.agent.post("/api/v1/workspaces").send({
      name: "Second Workspace",
      slug: `delete-next-${Date.now().toString(36)}`,
    });
    expect(secondWorkspace.status).toBe(201);
    const nextWorkspaceId = secondWorkspace.body.workspace.id as string;

    const wrongConfirmation = await owner.agent.delete("/api/v1/workspace").send({
      workspaceId: owner.workspaceId,
      confirmSlug: "wrong-slug",
    });
    expect(wrongConfirmation.status).toBe(400);
    expect(wrongConfirmation.body).toMatchObject({ error: "confirmation_mismatch" });

    const nonOwnerDelete = await otherUser.agent.delete("/api/v1/workspace").send({
      workspaceId: owner.workspaceId,
      confirmSlug: owner.workspaceSlug,
    });
    expect(nonOwnerDelete.status).toBe(403);
    expect(nonOwnerDelete.body).toMatchObject({ error: "forbidden" });

    const createdKey = await owner.agent
      .post("/api/v1/api-keys")
      .send({ workspaceId: owner.workspaceId, name: "Workspace Delete Key" });
    expect(createdKey.status).toBe(201);

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(owner.apiKey))
      .send({
        title: "Workspace Delete Doc",
        markdown: "# Workspace Delete Doc\n\nBody",
        workspaceId: owner.workspaceId,
        visibility: "workspace",
      });
    expect(published.status).toBe(201);

    const { getWorkspaceDeletionPreview } = await import(
      "@opendocs/shared/workspaces/service"
    );
    await expect(
      getWorkspaceDeletionPreview(owner.userId, owner.workspaceId),
    ).resolves.toMatchObject({
      canDelete: true,
      documentCount: 1,
      apiKeyCount: 2,
    });

    const deleted = await owner.agent.delete("/api/v1/workspace").send({
      workspaceId: owner.workspaceId,
      confirmSlug: owner.workspaceSlug,
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({
      success: true,
      deletedWorkspaceId: owner.workspaceId,
      nextWorkspaceId,
    });

    const [{ db }, schema] = await Promise.all([
      import("@opendocs/shared/db"),
      import("@opendocs/shared/db/schema"),
    ]);
    if (!db) throw new Error("Database is not initialized.");
    const [workspaceRow] = await db
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, owner.workspaceId));
    const [postRow] = await db
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .where(eq(schema.posts.workspaceId, owner.workspaceId));
    const [apiKeyRow] = await db
      .select({ id: schema.apiKeys.id })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.workspaceId, owner.workspaceId));
    const [memberRow] = await db
      .select({ id: schema.workspaceMembers.id })
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.workspaceId, owner.workspaceId));

    expect(workspaceRow).toBeUndefined();
    expect(postRow).toBeUndefined();
    expect(apiKeyRow).toBeUndefined();
    expect(memberRow).toBeUndefined();
  });

  it("covers api key CRUD and workspace settings endpoints", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();
    const noWorkspaceUser = await createSessionAgent();

    const listKeys = await user.agent.get("/api/v1/api-keys");
    const unauthorizedKeys = await request(app).get("/api/v1/api-keys");
    const missingWorkspaceKey = await user.agent.post("/api/v1/api-keys").send({ name: "No Workspace" });
    const foreignWorkspaceKey = await noWorkspaceUser.agent
      .post("/api/v1/api-keys")
      .send({ workspaceId: user.workspaceId, name: "Foreign Workspace" });
    const invalidKeyName = await user.agent
      .post("/api/v1/api-keys")
      .send({ workspaceId: user.workspaceId, name: "" });
    const createdKey = await user.agent
      .post("/api/v1/api-keys")
      .send({ workspaceId: user.workspaceId, name: "CI Key" });

    expect(listKeys.status).toBe(200);
    expect(listKeys.body.keys.length).toBeGreaterThanOrEqual(1);
    expect(unauthorizedKeys.status).toBe(401);
    expect(missingWorkspaceKey.status).toBe(400);
    expect(missingWorkspaceKey.body.error).toBe("invalid_request");
    expect(foreignWorkspaceKey.status).toBe(403);
    expect(foreignWorkspaceKey.body).toMatchObject({ error: "forbidden" });
    expect(invalidKeyName.status).toBe(400);
    expect(invalidKeyName.body.error).toBe("invalid_request");
    expect(createdKey.status).toBe(201);
    expect(createdKey.body.plaintext.startsWith("od_live_")).toBe(true);

    const revoked = await user.agent.delete(`/api/v1/api-keys/${createdKey.body.id}`);
    const missingRevoke = await user.agent.delete("/api/v1/api-keys/not-a-real-key");

    expect(revoked.status).toBe(200);
    expect(revoked.body).toEqual({ success: true });
    expect(missingRevoke.status).toBe(404);
    expect(missingRevoke.body).toMatchObject({ error: "not_found" });

    const workspace = await user.agent.get("/api/v1/workspace");
    const currentWorkspace = await user.agent.get("/api/v1/workspaces/current");
    const invalidWorkspaceUpdate = await user.agent
      .post("/api/v1/workspace")
      .send({ workspaceId: user.workspaceId, name: "" });
    const updatedWorkspace = await user.agent
      .post("/api/v1/workspace")
      .send({ workspaceId: user.workspaceId, name: "Updated Workspace Name" });
    const enablePublicDocs = await user.agent
      .post("/api/v1/workspace/public-documents")
      .send({ workspaceId: user.workspaceId, allowed: true });
    const enabledReadback = await user.agent.get("/api/v1/workspace");
    const togglePublicDocs = await user.agent
      .post("/api/v1/workspace/public-documents")
      .send({ workspaceId: user.workspaceId, allowed: false });
    const missingWorkspaceId = await user.agent
      .post("/api/v1/workspace/public-documents")
      .send({ allowed: true });
    const invalidPublicDocs = await user.agent
      .post("/api/v1/workspace/public-documents")
      .send({ workspaceId: user.workspaceId, allowed: "nope" });
    const updatedBio = await user.agent
      .post("/api/v1/workspace/bio")
      .send({ workspaceId: user.workspaceId, bio: "Team bio copy." });
    const bioReadback = await user.agent.get("/api/v1/workspace");
    const imagePresignMissingLength = await user.agent
      .post("/api/v1/storage/images/presign-upload")
      .send({ workspaceId: user.workspaceId, contentType: "image/png" });
    const imagePresignTooLarge = await user.agent
      .post("/api/v1/storage/images/presign-upload")
      .send({
        workspaceId: user.workspaceId,
        contentType: "image/png",
        contentLength: MAX_DIRECT_IMAGE_UPLOAD_BYTES + 1,
      });
    const foreignLogoUpload = await noWorkspaceUser.agent
      .post("/api/v1/workspace/logo/upload")
      .field("workspaceId", user.workspaceId)
      .attach("file", Buffer.from("not-really-a-png"), {
        filename: "logo.png",
        contentType: "image/png",
      });

    expect(workspace.status).toBe(200);
    expect(workspace.body.workspace.name).toBe(user.workspaceName);
    expect(currentWorkspace.status).toBe(200);
    expect(currentWorkspace.body.workspace.id).toBe(user.workspaceId);
    expect(invalidWorkspaceUpdate.status).toBe(400);
    expect(invalidWorkspaceUpdate.body.error).toBe("invalid_request");
    expect(updatedWorkspace.status).toBe(200);
    expect(updatedWorkspace.body.name).toBe("Updated Workspace Name");
    expect(enablePublicDocs.status).toBe(200);
    expect(enablePublicDocs.body).toEqual({ allowPublicDocuments: true });
    expect(enabledReadback.status).toBe(200);
    expect(enabledReadback.body.workspace.allowPublicDocuments).toBe(true);
    expect(togglePublicDocs.status).toBe(200);
    expect(togglePublicDocs.body).toEqual({ allowPublicDocuments: false });
    expect(missingWorkspaceId.status).toBe(400);
    expect(missingWorkspaceId.body.error).toBe("invalid_request");
    expect(invalidPublicDocs.status).toBe(400);
    expect(invalidPublicDocs.body.error).toBe("invalid_request");
    expect(updatedBio.status).toBe(200);
    expect(updatedBio.body).toEqual({ bio: "Team bio copy." });
    expect(bioReadback.status).toBe(200);
    expect(bioReadback.body.workspace.bio).toBe("Team bio copy.");
    expect(imagePresignMissingLength.status).toBe(400);
    expect(imagePresignMissingLength.body.error).toBe("invalid_request");
    expect(imagePresignTooLarge.status).toBe(400);
    expect(imagePresignTooLarge.body.error).toBe("invalid_request");
    expect(foreignLogoUpload.status).toBe(403);
    expect(foreignLogoUpload.body).toMatchObject({ error: "forbidden" });

    // Final readback — confirm the name update from earlier in the test
    // actually persisted to the DB (regression coverage for the
    // .limit(1)-without-order-by bug that used to target a random
    // workspace on multi-membership users).
    const nameReadback = await user.agent.get("/api/v1/workspace");
    expect(nameReadback.status).toBe(200);
    expect(nameReadback.body.workspace.name).toBe("Updated Workspace Name");

    const meWithRevokedKey = await request(app)
      .get("/api/v1/me")
      .set(authHeaders(createdKey.body.plaintext));
    expect(meWithRevokedKey.status).toBe(401);
  });

  it("falls back to the earliest-joined workspace when no workspaceId is given", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();
    const [{ db }, { workspaceMembers }] = await Promise.all([
      import("@opendocs/shared/db"),
      import("@opendocs/shared/db/schema"),
    ]);
    if (!db) throw new Error("Database is not initialized.");
    // Two more memberships, inserted after the user's own. The earliest
    // joined is neither the first row inserted nor the lowest workspace id,
    // so neither table nor index order can pick it by accident.
    const others = [
      (await createOnboardedUser()).workspaceId,
      (await createOnboardedUser()).workspaceId,
    ].sort();
    const earliest = others[1];
    for (const [workspaceId, joinedAt] of [
      [others[0], "2021-01-01T00:00:00Z"],
      [earliest, "2020-01-01T00:00:00Z"],
    ] as const) {
      await db.insert(workspaceMembers).values({
        workspaceId,
        userId: user.userId,
        role: "member",
        status: "active",
        joinedAt: new Date(joinedAt),
      });
    }

    const me = await request(app).get("/api/v1/me").set(authHeaders(user.apiKey));
    expect(me.body.onboarding.workspace.id).toBe(earliest);
    const workspace = await user.agent.get("/api/v1/workspace");
    expect(workspace.body.workspace.id).toBe(earliest);

    const explicit = await user.agent.get("/api/v1/workspace").query({ workspaceId: user.workspaceId });
    expect(explicit.body.workspace.id).toBe(user.workspaceId);
  });

  it("keeps the public-posts switch with the workspace owner", async () => {
    const owner = await createOnboardedUser();
    const admin = await createOnboardedUser();
    const [{ db }, { workspaceMembers }] = await Promise.all([
      import("@opendocs/shared/db"),
      import("@opendocs/shared/db/schema"),
    ]);
    if (!db) throw new Error("Database is not initialized.");
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: owner.workspaceId, userId: admin.userId, role: "admin", status: "active" });

    const byAdmin = await admin.agent
      .post("/api/v1/workspace/public-documents")
      .send({ workspaceId: owner.workspaceId, allowed: true });
    expect(byAdmin.status).toBe(403);
    expect(byAdmin.body.error).toBe("forbidden");

    const byOwner = await owner.agent
      .post("/api/v1/workspace/public-documents")
      .send({ workspaceId: owner.workspaceId, allowed: true });
    expect(byOwner.status).toBe(200);
  });
});
