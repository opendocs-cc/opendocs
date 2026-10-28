import { describe, expect, it } from "vitest";
import request from "supertest";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";

async function addMember(workspaceId: string, userId: string, role: "member" | "admin") {
  const [{ db }, { workspaceMembers }] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
  ]);
  if (!db) throw new Error("Database is not initialized.");
  await db.insert(workspaceMembers).values({ workspaceId, userId, role, status: "active" });
}

describe("editing documents in a shared workspace", () => {
  it("lets any member edit, retag and restore a document, and records who did it", async () => {
    const app = await getTestApp();
    const author = await createOnboardedUser();
    const member = await createOnboardedUser();
    await addMember(author.workspaceId, member.userId, "member");
    const ws = { workspaceId: author.workspaceId };

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(author.apiKey))
      .send({ title: "Team doc", markdown: "# Team doc\n\nFirst draft", ...ws, visibility: "workspace" });
    expect(published.status).toBe(201);
    const postId = published.body.postId as string;

    const edit = await request(app)
      .post(`/api/v1/posts/${postId}/update`)
      .query(ws)
      .set(authHeaders(member.apiKey))
      .send({ markdown: "# Team doc\n\nEdited by a teammate", ...ws });
    expect(edit.status).toBe(200);
    expect(edit.body.versionNumber).toBe(2);

    const tags = await request(app)
      .patch(`/api/v1/posts/${postId}/tags`)
      .query(ws)
      .set(authHeaders(member.apiKey))
      .send({ add: ["reviewed"] });
    expect(tags.status).toBe(200);
    expect(tags.body.tags).toContain("reviewed");

    const restore = await request(app)
      .post(`/api/v1/posts/${postId}/versions/1/restore`)
      .query(ws)
      .set(authHeaders(member.apiKey));
    expect(restore.status).toBe(200);

    const history = await request(app)
      .get(`/api/v1/posts/${postId}/versions`)
      .query(ws)
      .set(authHeaders(author.apiKey));
    expect(history.status).toBe(200);
    const byVersion = new Map(
      (history.body.versions as Array<{ versionNumber: number; createdBy: string | null }>).map((v) => [
        v.versionNumber,
        v.createdBy,
      ]),
    );
    expect(byVersion.get(1)).toBe(author.username);
    expect(byVersion.get(2)).toBe(member.username);
    expect(byVersion.get(3)).toBe(member.username);
  });

  it("keeps visibility changes and moves with the author and admins", async () => {
    const app = await getTestApp();
    const author = await createOnboardedUser();
    const member = await createOnboardedUser();
    const admin = await createOnboardedUser();
    await addMember(author.workspaceId, member.userId, "member");
    await addMember(author.workspaceId, admin.userId, "admin");
    const ws = { workspaceId: author.workspaceId };

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(author.apiKey))
      .send({ title: "Private-ish", markdown: "# Private-ish\n\nBody", ...ws, visibility: "workspace" });
    const postId = published.body.postId as string;

    const memberMakesPrivate = await request(app)
      .post(`/api/v1/posts/${postId}/update`)
      .query(ws)
      .set(authHeaders(member.apiKey))
      .send({ markdown: "# Private-ish\n\nNew body", visibility: "private", ...ws });
    expect(memberMakesPrivate.status).toBe(403);
    expect(memberMakesPrivate.body.error).toBe("forbidden");

    const adminMakesPrivate = await request(app)
      .post(`/api/v1/posts/${postId}/update`)
      .query(ws)
      .set(authHeaders(admin.apiKey))
      .send({ markdown: "# Private-ish\n\nNew body", visibility: "private", ...ws });
    expect(adminMakesPrivate.status).toBe(200);
  });

  it("refuses people outside the workspace with a clear error", async () => {
    const app = await getTestApp();
    const author = await createOnboardedUser();
    const outsider = await createOnboardedUser();
    const ws = { workspaceId: author.workspaceId };

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(author.apiKey))
      .send({ title: "Public doc", markdown: "# Public doc\n\nBody", ...ws, visibility: "workspace" });
    const postId = published.body.postId as string;

    const edit = await request(app)
      .post(`/api/v1/posts/${postId}/update`)
      .query(ws)
      .set(authHeaders(outsider.apiKey))
      .send({ markdown: "# Public doc\n\nVandalized", ...ws });
    expect([403, 404]).toContain(edit.status);
    expect(edit.body.error).not.toBe("update_failed");
  });

  it("lets the author, owners and admins manage a member's document through the API, and not other members", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    const author = await createOnboardedUser();
    const member = await createOnboardedUser();
    const admin = await createOnboardedUser();
    await addMember(owner.workspaceId, author.userId, "member");
    await addMember(owner.workspaceId, member.userId, "member");
    await addMember(owner.workspaceId, admin.userId, "admin");
    const ws = { workspaceId: owner.workspaceId };

    const publish = async (slug: string) => {
      const res = await request(app)
        .post("/api/v1/publish")
        .set(authHeaders(author.apiKey))
        .send({ title: slug, slug, markdown: `# ${slug}\n\nBody`, ...ws, visibility: "workspace" });
      expect(res.status).toBe(201);
      return res.body.postId as string;
    };
    const firstId = await publish("quarterly-notes");
    const secondId = await publish("hiring-plan");

    // Another member can edit but not manage, by id or by slug.
    for (const ref of [firstId, "quarterly-notes"]) {
      const visibility = await request(app)
        .post(`/api/v1/posts/${ref}/visibility`)
        .query(ws)
        .set(authHeaders(member.apiKey))
        .send({ visibility: "private" });
      const unpublish = await request(app)
        .post(`/api/v1/posts/${ref}/unpublish`)
        .query(ws)
        .set(authHeaders(member.apiKey));
      const remove = await request(app)
        .delete(`/api/v1/posts/${ref}`)
        .query(ws)
        .set(authHeaders(member.apiKey));
      for (const res of [visibility, unpublish, remove]) {
        expect(res.status).toBe(403);
        expect(res.body.error).toBe("forbidden");
      }
    }

    // An admin can, addressing the document by slug in the workspace.
    const adminVisibility = await request(app)
      .post("/api/v1/posts/quarterly-notes/visibility")
      .query(ws)
      .set(authHeaders(admin.apiKey))
      .send({ visibility: "public", confirmPublic: true });
    expect(adminVisibility.status).toBe(200);
    // Visibility responses also carry the document's links (url, publicUrl).
    expect(adminVisibility.body).toMatchObject({ postId: firstId, visibility: "public" });
    expect(adminVisibility.body.publicUrl).toMatch(/\/quarterly-notes$/);

    const adminUnpublish = await request(app)
      .post("/api/v1/posts/quarterly-notes/unpublish")
      .query(ws)
      .set(authHeaders(admin.apiKey));
    expect(adminUnpublish.status).toBe(200);
    expect(adminUnpublish.body).toEqual({ postId: firstId, unpublished: true });

    const adminDelete = await request(app)
      .delete(`/api/v1/posts/${firstId}`)
      .set(authHeaders(admin.apiKey));
    expect(adminDelete.status).toBe(200);
    expect(adminDelete.body).toMatchObject({ postId: firstId, deleted: true });

    // So can the owner.
    const ownerDelete = await request(app)
      .delete("/api/v1/posts/hiring-plan")
      .query(ws)
      .set(authHeaders(owner.apiKey));
    expect(ownerDelete.status).toBe(200);
    expect(ownerDelete.body).toMatchObject({ postId: secondId, deleted: true });
  });

  it("lets a member update and retag a teammate's document by slug", async () => {
    const app = await getTestApp();
    const author = await createOnboardedUser();
    const member = await createOnboardedUser();
    await addMember(author.workspaceId, member.userId, "member");
    const ws = { workspaceId: author.workspaceId };

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(author.apiKey))
      .send({ title: "Runbook", slug: "runbook", markdown: "# Runbook\n\nStep one", ...ws, visibility: "workspace" });
    expect(published.status).toBe(201);

    const edit = await request(app)
      .post("/api/v1/posts/runbook/update")
      .query(ws)
      .set(authHeaders(member.apiKey))
      .send({ markdown: "# Runbook\n\nStep one, then two", ...ws });
    expect(edit.status).toBe(200);
    expect(edit.body).toMatchObject({ postId: published.body.postId, versionNumber: 2 });

    const tags = await request(app)
      .patch("/api/v1/posts/runbook/tags")
      .query(ws)
      .set(authHeaders(member.apiKey))
      .send({ add: ["ops"] });
    expect(tags.status).toBe(200);
    expect(tags.body).toEqual({ postId: published.body.postId, tags: ["ops"] });

    // Without a workspace scope a slug still resolves inside the caller's
    // own workspaces.
    const unscoped = await request(app)
      .get("/api/v1/posts/runbook")
      .set(authHeaders(member.apiKey));
    expect(unscoped.status).toBe(200);
    expect(unscoped.body.post.id).toBe(published.body.postId);
  });

  it("never reaches another workspace's document or a teammate's private one", async () => {
    const app = await getTestApp();
    const author = await createOnboardedUser();
    const admin = await createOnboardedUser();
    const outsider = await createOnboardedUser();
    await addMember(author.workspaceId, admin.userId, "admin");
    const ws = { workspaceId: author.workspaceId };

    const publish = async (who: typeof author, body: Record<string, unknown>) => {
      const res = await request(app).post("/api/v1/publish").set(authHeaders(who.apiKey)).send(body);
      expect(res.status).toBe(201);
      return res.body.postId as string;
    };
    const privateId = await publish(author, {
      title: "Salary notes", slug: "salary-notes", markdown: "# Salary notes", ...ws, visibility: "private",
    });
    const teamId = await publish(author, {
      title: "Roadmap", slug: "roadmap", markdown: "# Roadmap\n\nTheirs", ...ws, visibility: "workspace",
    });
    // The outsider has a document with the same slug in their own workspace.
    const outsiderOwnId = await publish(outsider, {
      title: "Roadmap", slug: "roadmap", markdown: "# Roadmap\n\nMine", workspaceId: outsider.workspaceId, visibility: "workspace",
    });

    const attempts = (who: typeof author, ref: string, query: Record<string, string> = {}) => [
      request(app).get(`/api/v1/posts/${ref}`).query(query).set(authHeaders(who.apiKey)),
      request(app).get(`/api/v1/posts/${ref}/raw`).query(query).set(authHeaders(who.apiKey)),
      request(app)
        .post(`/api/v1/posts/${ref}/update`)
        .query(query)
        .set(authHeaders(who.apiKey))
        .send({ markdown: "# Overwritten", workspaceId: author.workspaceId }),
      request(app).patch(`/api/v1/posts/${ref}/tags`).query(query).set(authHeaders(who.apiKey)).send({ add: ["x"] }),
      request(app)
        .post(`/api/v1/posts/${ref}/visibility`)
        .query(query)
        .set(authHeaders(who.apiKey))
        .send({ visibility: "workspace" }),
      request(app).post(`/api/v1/posts/${ref}/unpublish`).query(query).set(authHeaders(who.apiKey)),
      request(app).delete(`/api/v1/posts/${ref}`).query(query).set(authHeaders(who.apiKey)),
    ];

    // A teammate's private document stays the author's, admins included.
    for (const res of await Promise.all([...attempts(admin, privateId), ...attempts(admin, "salary-notes", ws)])) {
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("not_found");
    }
    // Another workspace's documents don't exist for the outsider, by id or by
    // slug, with or without naming that workspace.
    for (const res of await Promise.all([
      ...attempts(outsider, teamId),
      ...attempts(outsider, "salary-notes", ws),
      ...attempts(outsider, "roadmap", ws),
    ])) {
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("not_found");
    }
    // An unscoped slug resolves to the outsider's own document, not the
    // other workspace's one.
    const own = await request(app).get("/api/v1/posts/roadmap/raw").set(authHeaders(outsider.apiKey));
    expect(own.status).toBe(200);
    expect(own.body.postId).toBe(outsiderOwnId);
    expect(own.body.markdown).toContain("Mine");

    // Nothing changed.
    const intact = await request(app).get(`/api/v1/posts/${teamId}/raw`).set(authHeaders(author.apiKey));
    expect(intact.body).toMatchObject({ versionNumber: 1, markdown: "# Roadmap\n\nTheirs" });
  });

  it("keeps an unpublished document offline to members and outsiders, but not to its author and admins", async () => {
    const app = await getTestApp();
    const author = await createOnboardedUser();
    const member = await createOnboardedUser();
    const admin = await createOnboardedUser();
    const outsider = await createOnboardedUser();
    await addMember(author.workspaceId, member.userId, "member");
    await addMember(author.workspaceId, admin.userId, "admin");
    const [{ db }, { workspaces }, { eq }] = await Promise.all([
      import("@opendocs/shared/db"),
      import("@opendocs/shared/db/schema"),
      import("drizzle-orm"),
    ]);
    if (!db) throw new Error("Database is not initialized.");
    await db.update(workspaces).set({ allowPublicDocuments: true }).where(eq(workspaces.id, author.workspaceId));
    const ws = { workspaceId: author.workspaceId };

    const publish = (title: string, slug: string) =>
      request(app)
        .post("/api/v1/publish")
        .set(authHeaders(author.apiKey))
        .send({ title, slug, markdown: `# ${title}\n\nBody`, ...ws, visibility: "public", confirmPublic: true });
    const live = await publish("Live doc", "live-doc");
    const offline = await publish("Old pricing", "old-pricing");
    expect(offline.status).toBe(201);
    const offlineId = offline.body.postId as string;
    const unpublished = await request(app)
      .post(`/api/v1/posts/${offlineId}/unpublish`)
      .query(ws)
      .set(authHeaders(author.apiKey));
    expect(unpublished.status).toBe(200);

    const listIds = async (apiKey: string) => {
      const res = await request(app).get("/api/v1/posts").query(ws).set(authHeaders(apiKey));
      expect(res.status).toBe(200);
      return (res.body.posts as Array<{ id: string }>).map((p) => p.id);
    };
    const reads = async (apiKey: string) =>
      Promise.all([
        request(app).get(`/api/v1/posts/${offlineId}`).set(authHeaders(apiKey)),
        request(app).get("/api/v1/posts/old-pricing").query(ws).set(authHeaders(apiKey)),
        request(app).get(`/api/v1/posts/${offlineId}/raw`).set(authHeaders(apiKey)),
      ]).then((all) => all.map((r) => r.status));

    // Members see the live document but not the unpublished one.
    expect(await listIds(member.apiKey)).toEqual([live.body.postId]);
    expect(await reads(member.apiKey)).toEqual([404, 404, 404]);
    // Someone outside the workspace can't read it either, though it was public.
    expect(await reads(outsider.apiKey)).toEqual([404, 404, 404]);

    // The author and admins still see it, marked unpublished, and can delete it.
    for (const user of [author, admin]) {
      expect(await listIds(user.apiKey)).toContain(offlineId);
      expect(await reads(user.apiKey)).toEqual([200, 200, 200]);
    }
    const adminList = await request(app).get("/api/v1/posts").query(ws).set(authHeaders(admin.apiKey));
    expect(adminList.body.posts.find((p: { id: string }) => p.id === offlineId).isPublished).toBe(false);
    const deleted = await request(app).delete(`/api/v1/posts/${offlineId}`).query(ws).set(authHeaders(admin.apiKey));
    expect(deleted.status).toBe(200);
  });
});
