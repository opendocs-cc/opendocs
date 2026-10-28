import { describe, expect, it } from "vitest";
import request from "supertest";
import JSZip from "jszip";
import { eq } from "drizzle-orm";
import type { Response } from "superagent";

import { authHeaders, createOnboardedUser, createSessionAgent, getTestApp } from "../test-helpers/api";

function parseBinary(
  res: Response,
  callback: (err: Error | null, body: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

describe("onboarding, auth, and post routes", () => {
  it("enforces auth for protected session and dual-auth endpoints", async () => {
    const app = await getTestApp();

    const sessionOnly = await request(app).post("/api/v1/onboarding").send({
      username: "unauthenticated_user",
      workspaceName: "No Access",
    });
    const dualAuth = await request(app).get("/api/v1/me");

    expect(sessionOnly.status).toBe(401);
    expect(sessionOnly.body).toMatchObject({ error: "unauthorized" });
    expect(dualAuth.status).toBe(401);
    expect(dualAuth.body).toMatchObject({ error: "unauthorized" });
  });

  it("covers onboarding validation and duplicate username failures", async () => {
    const takenUser = await createOnboardedUser();

    const missingWorkspace = await createSessionAgent();
    const missingWorkspaceResponse = await missingWorkspace.agent.post("/api/v1/onboarding").send({
      username: "missing_workspace_name",
    });

    const reservedUser = await createSessionAgent();
    const reservedResponse = await reservedUser.agent.post("/api/v1/onboarding").send({
      username: "docs",
      workspaceName: "Reserved Workspace",
    });

    const duplicateUser = await createSessionAgent();
    const duplicateResponse = await duplicateUser.agent.post("/api/v1/onboarding").send({
      username: takenUser.username,
      workspaceName: "Duplicate Workspace",
    });

    expect(missingWorkspaceResponse.status).toBe(400);
    expect(missingWorkspaceResponse.body.error).toBe("onboarding_failed");

    expect(reservedResponse.status).toBe(400);
    expect(reservedResponse.body.error).toBe("onboarding_failed");

    expect(duplicateResponse.status).toBe(400);
    expect(duplicateResponse.body.error).toBe("onboarding_failed");
  });

  it("supports session and api-key access for account and post flows", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();

    const sessionMe = await user.agent.get("/api/v1/me");
    const apiKeyMe = await request(app).get("/api/v1/me").set(authHeaders(user.apiKey));
    const sessionProfile = await user.agent.get("/api/v1/profile");
    const apiKeyProfile = await request(app).get("/api/v1/profile").set(authHeaders(user.apiKey));

    expect(sessionMe.status).toBe(200);
    expect(apiKeyMe.status).toBe(200);
    expect(apiKeyMe.body.userId).toBe(user.userId);

    expect(sessionProfile.status).toBe(200);
    expect(sessionProfile.body.profile.username).toBe(user.username);
    expect(apiKeyProfile.status).toBe(200);
    expect(apiKeyProfile.body.profile.username).toBe(user.username);

    const invalidProfileUpdate = await request(app)
      .post("/api/v1/profile")
      .set(authHeaders(user.apiKey))
      .send({ fullName: "Should Fail" });
    const validProfileUpdate = await user.agent.post("/api/v1/profile").send({
      fullName: "OpenDocs Tester",
      bio: "Writes docs",
      profilePictureUrl: "https://example.com/avatar.png",
    });

    expect(invalidProfileUpdate.status).toBe(401);
    expect(validProfileUpdate.status).toBe(200);
    expect(validProfileUpdate.body.profile.fullName).toBe("OpenDocs Tester");

    const invalidPublish = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({
        markdown: "# Public doc",
        workspaceId: user.workspaceId,
        visibility: "public",
      });

    expect(invalidPublish.status).toBe(400);
    expect(invalidPublish.body.error).toBe("invalid_request");

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({
        title: "API Test Doc",
        markdown: "# Title\n\nInitial body",
        workspaceId: user.workspaceId,
        visibility: "workspace",
        tags: ["cli", "agents"],
      });

    expect(published.status).toBe(201);

    const postId = published.body.postId as string;
    expect(postId).toBeTruthy();

    const emptyPosts = await request(app).get("/api/v1/posts").set(authHeaders((await createOnboardedUser()).apiKey));
    const listPosts = await request(app)
      .get("/api/v1/posts")
      .query({ page: 1, limit: 10, tag: "cli" })
      .set(authHeaders(user.apiKey));

    expect(emptyPosts.status).toBe(200);
    expect(emptyPosts.body.posts).toEqual([]);
    expect(listPosts.status).toBe(200);
    expect(listPosts.body.posts).toHaveLength(1);
    expect(listPosts.body.pagination.page).toBe(1);

    const sessionPost = await user.agent.get(`/api/v1/posts/${postId}`);
    const apiKeyPost = await request(app).get(`/api/v1/posts/${postId}`).set(authHeaders(user.apiKey));
    const rawPost = await request(app).get(`/api/v1/posts/${postId}/raw`).set(authHeaders(user.apiKey));

    expect(sessionPost.status).toBe(200);
    expect(apiKeyPost.status).toBe(200);
    // Public URLs are workspace-slug prefixed (opendocs.cc/<workspace>/<slug>),
    // not username-prefixed — the username is only used for the user's personal
    // profile, not for document URLs.
    expect(apiKeyPost.body.post.url).toBe(`/${user.workspaceSlug}/${sessionPost.body.post.slug}`);
    expect(rawPost.status).toBe(200);
    expect(rawPost.body.markdown).toContain("Initial body");

    const otherUser = await createOnboardedUser();
    const foreignPost = await request(app).get(`/api/v1/posts/${postId}`).set(authHeaders(otherUser.apiKey));
    const foreignRaw = await request(app).get(`/api/v1/posts/${postId}/raw`).set(authHeaders(otherUser.apiKey));

    expect(foreignPost.status).toBe(404);
    expect(foreignRaw.status).toBe(404);

    const invalidUpdate = await request(app)
      .post(`/api/v1/posts/${postId}/update`)
      .set(authHeaders(user.apiKey))
      .send({ title: "", markdown: "" });
    const updated = await request(app)
      .post(`/api/v1/posts/${postId}/update`)
      .set(authHeaders(user.apiKey))
      .send({
        title: "Updated Title",
        markdown: "# Title\n\nUpdated body",
        workspaceId: user.workspaceId,
        visibility: "workspace",
        tags: ["cli", "updated"],
      });

    expect(invalidUpdate.status).toBe(400);
    expect(invalidUpdate.body.error).toBe("invalid_request");
    expect(updated.status).toBe(200);

    const invalidTags = await request(app)
      .patch(`/api/v1/posts/${postId}/tags`)
      .set(authHeaders(user.apiKey))
      .send({});
    const updatedTags = await request(app)
      .patch(`/api/v1/posts/${postId}/tags`)
      .set(authHeaders(user.apiKey))
      .send({
        add: ["release-notes"],
        remove: ["updated"],
      });

    expect(invalidTags.status).toBe(400);
    expect(invalidTags.body.error).toBe("invalid_request");
    expect(updatedTags.status).toBe(200);
    expect(updatedTags.body.tags).toContain("release-notes");
    expect(updatedTags.body.tags).not.toContain("updated");

    const invalidVisibility = await request(app)
      .post(`/api/v1/posts/${postId}/visibility`)
      .set(authHeaders(user.apiKey))
      .send({ visibility: "secret" });
    const publicWithoutConfirm = await request(app)
      .post(`/api/v1/posts/${postId}/visibility`)
      .set(authHeaders(user.apiKey))
      .send({ visibility: "public" });
    const privateVisibility = await request(app)
      .post(`/api/v1/posts/${postId}/visibility`)
      .set(authHeaders(user.apiKey))
      .send({ visibility: "private" });
    const metadataPreservingUpdate = await request(app)
      .post(`/api/v1/posts/${postId}/update`)
      .set(authHeaders(user.apiKey))
      .send({
        title: "Updated Again",
        markdown: "# Title\n\nUpdated body again",
        workspaceId: user.workspaceId,
      });
    const publicVisibility = await request(app)
      .post(`/api/v1/posts/${postId}/visibility`)
      .set(authHeaders(user.apiKey))
      .send({ visibility: "public", confirmPublic: true });

    expect(invalidVisibility.status).toBe(400);
    expect(invalidVisibility.body).toMatchObject({ error: "invalid_visibility" });
    expect(publicWithoutConfirm.status).toBe(400);
    expect(publicWithoutConfirm.body.error).toBe("visibility_change_failed");
    expect(privateVisibility.status).toBe(200);
    expect(privateVisibility.body.visibility).toBe("private");
    expect(metadataPreservingUpdate.status).toBe(200);
    expect(metadataPreservingUpdate.body.visibility).toBe("private");
    expect(metadataPreservingUpdate.body.tags).toEqual(
      expect.arrayContaining(["cli", "release-notes"]),
    );
    expect(publicVisibility.status).toBe(200);
    expect(publicVisibility.body.visibility).toBe("public");

    const missingUpdate = await request(app)
      .post("/api/v1/posts/not-a-real-post/update")
      .set(authHeaders(user.apiKey))
      .send({
        title: "Missing",
        markdown: "Missing",
        workspaceId: user.workspaceId,
        visibility: "workspace",
      });

    // Missing post now hits the explicit `resolvePostId` lookup and returns
    // 404 not_found — a more accurate status than the old catch-all 400
    // update_failed (which fired when `updatePostForUser` threw "Post not
    // found" from inside the service).
    expect(missingUpdate.status).toBe(404);
    expect(missingUpdate.body.error).toBe("not_found");

    const unpublish = await request(app)
      .post(`/api/v1/posts/${postId}/unpublish`)
      .set(authHeaders(user.apiKey));
    const unpublishAgain = await request(app)
      .post(`/api/v1/posts/${postId}/unpublish`)
      .set(authHeaders(user.apiKey));

    expect(unpublish.status).toBe(200);
    expect(unpublish.body.unpublished).toBe(true);
    expect(unpublishAgain.status).toBe(400);
    expect(unpublishAgain.body.error).toBe("unpublish_failed");
  });

  // Regression: before the workspaceId query scope landed, a user with the
  // same slug in two workspaces hit `.limit(1)` on a non-unique
  // `(authorUserId, slug)` match and got either row non-deterministically.
  // After the fix, slug lookups scope to the workspace the CLI passes via
  // `?workspaceId=...`, so each command hits the correct row regardless of
  // which row the planner would've picked otherwise.
  it("scopes slug-based post lookups to the caller's active workspace", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();

    // Create a second workspace for the same user. Done as a direct DB
    // insert because the free plan caps owned workspaces at 1, so hitting
    // POST /workspaces with the session agent returns 403 plan_limit. We
    // only need the second workspace to exist + have a membership row
    // (publish uses `authorUserId = userId`, not a membership check), so
    // bypassing the plan gate here keeps the test focused on the slug bug.
    const [{ db }, { workspaces, workspaceMembers }] = await Promise.all([
      import("@opendocs/shared/db"),
      import("@opendocs/shared/db/schema"),
    ]);
    if (!db) throw new Error("Database is not initialized.");
    const secondWsSlug = `second-${Date.now().toString(36).slice(-6)}`;
    const [secondWs] = await db
      .insert(workspaces)
      .values({
        name: "Second Workspace",
        slug: secondWsSlug,
        ownerUserId: user.userId,
      })
      .returning({ id: workspaces.id, slug: workspaces.slug });
    await db.insert(workspaceMembers).values({
      workspaceId: secondWs.id,
      userId: user.userId,
      role: "owner",
      status: "active",
    });
    const secondWorkspaceId = secondWs.id;

    // Publish the same slug into both workspaces.
    const sharedSlug = "plan";

    const postInA = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({
        title: "Plan A",
        slug: sharedSlug,
        markdown: "# Plan A\n\nFrom workspace A",
        workspaceId: user.workspaceId,
        visibility: "workspace",
      });
    const postInB = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({
        title: "Plan B",
        slug: sharedSlug,
        markdown: "# Plan B\n\nFrom workspace B",
        workspaceId: secondWorkspaceId,
        visibility: "workspace",
      });

    expect(postInA.status).toBe(201);
    expect(postInB.status).toBe(201);
    // Sanity: different postIds so we can actually tell them apart.
    expect(postInA.body.postId).not.toBe(postInB.body.postId);

    // GET /posts/:slug with an explicit workspace scope returns the right
    // row for each workspace.
    const getInA = await request(app)
      .get(`/api/v1/posts/${sharedSlug}`)
      .query({ workspaceId: user.workspaceId })
      .set(authHeaders(user.apiKey));
    const getInB = await request(app)
      .get(`/api/v1/posts/${sharedSlug}`)
      .query({ workspaceId: secondWorkspaceId })
      .set(authHeaders(user.apiKey));

    expect(getInA.status).toBe(200);
    expect(getInA.body.post.id).toBe(postInA.body.postId);
    expect(getInA.body.post.title).toBe("Plan A");
    expect(getInB.status).toBe(200);
    expect(getInB.body.post.id).toBe(postInB.body.postId);
    expect(getInB.body.post.title).toBe("Plan B");

    // Same story for the raw/markdown endpoint.
    const rawInA = await request(app)
      .get(`/api/v1/posts/${sharedSlug}/raw`)
      .query({ workspaceId: user.workspaceId })
      .set(authHeaders(user.apiKey));
    const rawInB = await request(app)
      .get(`/api/v1/posts/${sharedSlug}/raw`)
      .query({ workspaceId: secondWorkspaceId })
      .set(authHeaders(user.apiKey));

    expect(rawInA.status).toBe(200);
    expect(rawInA.body.markdown).toContain("From workspace A");
    expect(rawInB.status).toBe(200);
    expect(rawInB.body.markdown).toContain("From workspace B");

    // A slug that exists only in A but is looked up under B's scope 404s
    // AND surfaces a hint so the CLI can prompt the user to switch.
    const onlyInA = "only-in-a";
    const publishOnlyInA = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({
        title: "Only In A",
        slug: onlyInA,
        markdown: "# Only A",
        workspaceId: user.workspaceId,
        visibility: "workspace",
      });
    expect(publishOnlyInA.status).toBe(201);

    const missInB = await request(app)
      .get(`/api/v1/posts/${onlyInA}`)
      .query({ workspaceId: secondWorkspaceId })
      .set(authHeaders(user.apiKey));

    expect(missInB.status).toBe(404);
    expect(missInB.body.error).toBe("not_found");
    // Hint should name the workspace the slug actually lives in and the
    // concrete command to unstick the user.
    expect(missInB.body.message).toContain(user.workspaceSlug);
    expect(missInB.body.message).toContain("opendocs workspace use");

    // Slug that doesn't exist anywhere: no hint, clean 404.
    const truly404 = await request(app)
      .get(`/api/v1/posts/nonexistent-slug`)
      .query({ workspaceId: user.workspaceId })
      .set(authHeaders(user.apiKey));
    expect(truly404.status).toBe(404);
    expect(truly404.body.error).toBe("not_found");
    expect(truly404.body.message).toBe("Not found.");
  });

  it("never evaluates JavaScript front matter", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser({ workspaceName: "Frontmatter Eval" });

    const res = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({
        markdown: '---js\n{ title: "EVALUATED " + (6 * 7) }\n---\n\n# Safe title\n',
        workspaceId: user.workspaceId,
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Safe title");
  });

  it("builds workspace ZIP downloads from the current viewer's access", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser({ workspaceName: "Zip Access" });
    const [{ db }, { workspaces }] = await Promise.all([
      import("@opendocs/shared/db"),
      import("@opendocs/shared/db/schema"),
    ]);
    if (!db) throw new Error("Database is not initialized.");

    await db
      .update(workspaces)
      .set({ allowPublicDocuments: true })
      .where(eq(workspaces.id, user.workspaceId));

    const publicPost = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({
        title: "Public ZIP Doc",
        slug: "public-zip-doc",
        markdown: "# Public ZIP Doc\n\nVisible to everyone",
        workspaceId: user.workspaceId,
        visibility: "public",
        confirmPublic: true,
      });
    const workspacePost = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({
        title: "Workspace ZIP Doc",
        slug: "workspace-zip-doc",
        markdown: "# Workspace ZIP Doc\n\nMembers only",
        workspaceId: user.workspaceId,
        visibility: "workspace",
      });
    const privatePost = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({
        title: "Private ZIP Doc",
        slug: "private-zip-doc",
        markdown: "# Private ZIP Doc\n\nAuthor only",
        workspaceId: user.workspaceId,
        visibility: "private",
      });

    expect(publicPost.status).toBe(201);
    expect(workspacePost.status).toBe(201);
    expect(privatePost.status).toBe(201);

    const anonymousZipResponse = await request(app)
      .get(`/api/v1/public/workspaces/${user.workspaceSlug}/markdown.zip`)
      .buffer(true)
      .parse(parseBinary);

    expect(anonymousZipResponse.status).toBe(200);
    const anonymousZip = await JSZip.loadAsync(anonymousZipResponse.body as Buffer);
    expect(anonymousZip.file("public-zip-doc.md")).toBeTruthy();
    expect(anonymousZip.file("workspace-zip-doc.md")).toBeNull();
    expect(anonymousZip.file("private-zip-doc.md")).toBeNull();

    await db
      .update(workspaces)
      .set({ allowPublicDocuments: false })
      .where(eq(workspaces.id, user.workspaceId));

    const anonymousPrivateWorkspaceResponse = await request(app)
      .get(`/api/v1/public/workspaces/${user.workspaceSlug}/markdown.zip`);
    expect(anonymousPrivateWorkspaceResponse.status).toBe(404);

    const memberZipResponse = await user.agent
      .get(`/api/v1/public/workspaces/${user.workspaceSlug}/markdown.zip`)
      .buffer(true)
      .parse(parseBinary);

    expect(memberZipResponse.status).toBe(200);
    const memberZip = await JSZip.loadAsync(memberZipResponse.body as Buffer);
    expect(memberZip.file("public-zip-doc.md")).toBeTruthy();
    expect(memberZip.file("workspace-zip-doc.md")).toBeTruthy();
    expect(memberZip.file("private-zip-doc.md")).toBeTruthy();
  });
});
