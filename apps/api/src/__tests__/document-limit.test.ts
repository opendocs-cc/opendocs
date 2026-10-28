import { describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

import { PLAN_LIMITS } from "@opendocs/shared/billing/plan-limits";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";

/** The Free plan's published-document cap; the tests follow it if it changes. */
const FREE_CAP = PLAN_LIMITS.free.documentsPerWorkspace;

type OnboardedUser = Awaited<ReturnType<typeof createOnboardedUser>>;

// Seed N published documents for a workspace via the batch endpoint. Chunks
// into batches of 25 because the publish batch route caps at 25 per call. We go
// through the real HTTP endpoint (vs a direct DB insert) so that the seeded
// posts are indistinguishable from user-created ones for the quota check.
const PUBLISH_BATCH_SIZE = 25;

async function seedPublishedDocs(
  app: Awaited<ReturnType<typeof getTestApp>>,
  user: OnboardedUser,
  count: number,
  titlePrefix = "seed",
) {
  for (let start = 0; start < count; start += PUBLISH_BATCH_SIZE) {
    const chunkSize = Math.min(PUBLISH_BATCH_SIZE, count - start);
    const documents = Array.from({ length: chunkSize }, (_, j) => ({
      title: `${titlePrefix} ${start + j}`,
      markdown: `# ${titlePrefix} ${start + j}\n\nBody`,
      workspaceId: user.workspaceId,
      visibility: "workspace" as const,
    }));

    const res = await request(app)
      .post("/api/v1/publish/batch")
      .set(authHeaders(user.apiKey))
      .send({ documents });

    if (res.status !== 207 || res.body.summary.failed !== 0) {
      throw new Error(
        `Seed publish failed: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
  }
}

// Flip the owner's personal plan to "pro" so the workspace's effective tier
// becomes unlimited. Goes through the DB directly — there's no endpoint for
// setting a plan outside of the Paddle webhook flow.
async function upgradeUserToPro(userId: string) {
  const [{ db }, { user }] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
  ]);
  if (!db) {
    throw new Error("Database is not initialized.");
  }
  await db.update(user).set({ plan: "pro" }).where(eq(user.id, userId));
}

describe("document_limit enforcement", () => {
  it("returns 403 when a Free workspace at its cap tries to publish a single doc", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    await seedPublishedDocs(app, owner, FREE_CAP);

    const res = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(owner.apiKey))
      .send({
        title: "One Too Many",
        markdown: "# One too many\n\nBody",
        workspaceId: owner.workspaceId,
        visibility: "workspace",
      });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: "document_limit",
      plan: "free",
      limit: FREE_CAP,
      used: FREE_CAP,
    });
    expect(res.body.message).toContain("free plan");
  });

  it("succeeds when a Free workspace one below its cap publishes one more (exact-fit)", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    await seedPublishedDocs(app, owner, FREE_CAP - 1);

    const res = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(owner.apiKey))
      .send({
        title: "Last Free Doc",
        markdown: "# Last free doc\n\nBody",
        workspaceId: owner.workspaceId,
        visibility: "workspace",
      });

    expect(res.status).toBe(201);
    expect(res.body.postId).toBeTruthy();

    // Sanity: next publish now hits the cap.
    const overflow = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(owner.apiKey))
      .send({
        title: "One Too Many",
        markdown: "# One too many\n\nBody",
        workspaceId: owner.workspaceId,
        visibility: "workspace",
      });
    expect(overflow.status).toBe(403);
    expect(overflow.body.error).toBe("document_limit");
  });

  it("rejects the whole batch up-front when it would push a Free workspace over the cap", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    await seedPublishedDocs(app, owner, FREE_CAP - 1);

    const documents = Array.from({ length: 3 }, (_, i) => ({
      title: `Overflow ${i}`,
      markdown: `# Overflow ${i}\n\nBody`,
      workspaceId: owner.workspaceId,
      visibility: "workspace" as const,
    }));

    const res = await request(app)
      .post("/api/v1/publish/batch")
      .set(authHeaders(owner.apiKey))
      .send({ documents });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: "document_limit",
      plan: "free",
      limit: FREE_CAP,
      used: FREE_CAP - 1,
      requested: 3,
      workspaceId: owner.workspaceId,
    });
    expect(res.body.message).toContain("1 slot left");

    // Atomicity: the pre-check must reject before any publish happens. Count
    // should still be one below the cap — none of the 3 leaked through.
    const posts = await request(app)
      .get("/api/v1/posts")
      .query({ page: 1, limit: 100 })
      .set(authHeaders(owner.apiKey));
    expect(posts.status).toBe(200);
    expect(posts.body.posts).toHaveLength(FREE_CAP - 1);
  });

  it("allows a batch that exactly fills the remaining Free quota", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    await seedPublishedDocs(app, owner, FREE_CAP - 2);

    const documents = Array.from({ length: 2 }, (_, i) => ({
      title: `Fill ${i}`,
      markdown: `# Fill ${i}\n\nBody`,
      workspaceId: owner.workspaceId,
      visibility: "workspace" as const,
    }));

    const res = await request(app)
      .post("/api/v1/publish/batch")
      .set(authHeaders(owner.apiKey))
      .send({ documents });

    expect(res.status).toBe(207);
    expect(res.body.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
  });

  it("does not gate Pro workspaces — publishing past the Free cap still succeeds", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    await upgradeUserToPro(owner.userId);

    // One past the Free cap. Should all succeed on Pro.
    await seedPublishedDocs(app, owner, FREE_CAP + 1);

    // And one more single publish still succeeds.
    const res = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(owner.apiKey))
      .send({
        title: "Pro Extra Doc",
        markdown: "# Pro extra\n\nBody",
        workspaceId: owner.workspaceId,
        visibility: "workspace",
      });

    expect(res.status).toBe(201);
    expect(res.body.postId).toBeTruthy();
  });

  it("exposes the current quota on the /me endpoint so the CLI can pre-check", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    await seedPublishedDocs(app, owner, 3);

    const res = await request(app).get("/api/v1/me").set(authHeaders(owner.apiKey));

    expect(res.status).toBe(200);
    expect(res.body.quota).toBeDefined();
    expect(res.body.quota.documents).toMatchObject({
      plan: "free",
      limit: FREE_CAP,
      used: 3,
      remaining: FREE_CAP - 3,
    });
  });

  it("reports `limit: null` and `remaining: null` on /me for unlimited Pro tiers", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    await upgradeUserToPro(owner.userId);

    const res = await request(app).get("/api/v1/me").set(authHeaders(owner.apiKey));

    expect(res.status).toBe(200);
    expect(res.body.quota.documents).toMatchObject({
      plan: "pro",
      limit: null,
      remaining: null,
    });
  });
});
