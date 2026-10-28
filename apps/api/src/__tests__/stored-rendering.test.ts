import { describe, expect, it } from "vitest";
import request from "supertest";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";

const markdown = "# Field notes\n\n> [!NOTE]\n> Check the tide tables.\n\nEuler: $e^{i\\pi} + 1 = 0$.\n";

async function loadShared() {
  const [{ db }, schema, drizzle, markdownModule, workspaces, versions] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
    import("drizzle-orm"),
    import("@opendocs/shared/markdown"),
    import("@opendocs/shared/workspaces/service"),
    import("@opendocs/shared/posts/versions"),
  ]);
  if (!db) throw new Error("Database is not initialized.");
  return { db, ...schema, ...drizzle, ...markdownModule, ...workspaces, ...versions };
}

describe("stored renderings", () => {
  it("re-renders a version an older renderer made, in place, on first read", async () => {
    const app = await getTestApp();
    const author = await createOnboardedUser();
    const shared = await loadShared();
    const { db, posts, postVersions, eq } = shared;

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(author.apiKey))
      .send({ title: "Field notes", markdown, workspaceId: author.workspaceId, visibility: "workspace" });
    expect(published.status).toBe(201);
    const postId = published.body.postId as string;
    const slug = published.body.slug as string;

    // New publishes are stamped with the current renderer.
    const [fresh] = await db
      .select({ id: postVersions.id, sourceMetadata: postVersions.sourceMetadata })
      .from(postVersions)
      .where(eq(postVersions.postId, postId));
    expect(fresh.sourceMetadata?.rendererVersion).toBe(shared.RENDERER_VERSION);
    const contentHash = fresh.sourceMetadata?.contentHash;

    // Make it look like it was published before alerts and math existed.
    await db
      .update(postVersions)
      .set({
        renderedHtml: "<h1>Field notes</h1><blockquote><p>[!NOTE] Check the tide tables.</p></blockquote>",
        toc: [],
        sourceMetadata: { contentHash },
      })
      .where(eq(postVersions.id, fresh.id));
    const [before] = await db.select({ updatedAt: posts.updatedAt }).from(posts).where(eq(posts.id, postId));

    const article = await shared.getPostByWorkspaceSlugAndPostSlug(author.workspaceSlug, slug, author.userId);
    expect(article?.renderedHtml).toContain("markdown-alert");
    expect(article?.renderedHtml).toContain("katex");
    expect(article?.toc.map((h) => h.text)).toEqual(["Field notes"]);

    // Updated in place: same single version, metadata kept and stamped,
    // and the post doesn't count as edited.
    const rows = await db
      .select({ renderedHtml: postVersions.renderedHtml, sourceMetadata: postVersions.sourceMetadata })
      .from(postVersions)
      .where(eq(postVersions.postId, postId));
    expect(rows).toHaveLength(1);
    expect(rows[0].renderedHtml).toContain("markdown-alert");
    expect(rows[0].sourceMetadata).toMatchObject({ contentHash, rendererVersion: shared.RENDERER_VERSION });
    const [after] = await db.select({ updatedAt: posts.updatedAt }).from(posts).where(eq(posts.id, postId));
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());

    // Once stamped, the stored HTML is served as is.
    await db.update(postVersions).set({ renderedHtml: "<p>stored</p>" }).where(eq(postVersions.id, fresh.id));
    const again = await shared.getPostByWorkspaceSlugAndPostSlug(author.workspaceSlug, slug, author.userId);
    expect(again?.renderedHtml).toBe("<p>stored</p>");
  });

  it("refreshes old versions in the history view, and restores with fresh HTML", async () => {
    const app = await getTestApp();
    const author = await createOnboardedUser();
    const shared = await loadShared();
    const { db, postVersions, eq, and } = shared;
    const ws = { workspaceId: author.workspaceId };

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(author.apiKey))
      .send({ title: "Field notes", markdown, ...ws, visibility: "workspace" });
    const postId = published.body.postId as string;
    await request(app)
      .post(`/api/v1/posts/${postId}/update`)
      .query(ws)
      .set(authHeaders(author.apiKey))
      .send({ markdown: "# Field notes\n\nRewritten without callouts.\n", ...ws });

    const versionOne = and(eq(postVersions.postId, postId), eq(postVersions.versionNumber, 1));
    await db
      .update(postVersions)
      .set({ renderedHtml: "<p>[!NOTE] old</p>", sourceMetadata: {} })
      .where(versionOne);

    const content = await shared.getPostVersionContent(postId, 1);
    expect(content?.renderedHtml).toContain("markdown-alert");

    // Restoring copies v1 forward with a fresh, stamped rendering.
    await db
      .update(postVersions)
      .set({ renderedHtml: "<p>[!NOTE] old</p>", sourceMetadata: {} })
      .where(versionOne);
    const restored = await request(app)
      .post(`/api/v1/posts/${postId}/versions/1/restore`)
      .query(ws)
      .set(authHeaders(author.apiKey));
    expect(restored.status).toBe(200);
    const [v3] = await db
      .select({ renderedHtml: postVersions.renderedHtml, sourceMetadata: postVersions.sourceMetadata })
      .from(postVersions)
      .where(and(eq(postVersions.postId, postId), eq(postVersions.versionNumber, 3)));
    expect(v3.renderedHtml).toContain("markdown-alert");
    expect(v3.sourceMetadata?.rendererVersion).toBe(shared.RENDERER_VERSION);
  });
});
