import { describe, expect, it } from "vitest";
import request from "supertest";
import JSZip from "jszip";
import { eq } from "drizzle-orm";
import type { Response } from "superagent";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";

function parseBinary(res: Response, callback: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

async function db() {
  const [{ db }, schema] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
  ]);
  if (!db) throw new Error("Database is not initialized.");
  return { db, ...schema };
}

const MARKDOWN = [
  "# Launch plan",
  "",
  "We ship in May.",
  "",
  "```private",
  "Budget ceiling is 40k, don't share.",
  "```",
  "",
  "Questions go to the launch channel.",
].join("\n");

describe("```private blocks in Markdown downloads", () => {
  it("leave them out of reader downloads and keep them for the author and members", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    const member = await createOnboardedUser();
    const outsider = await createOnboardedUser();
    const { db: database, workspaces, workspaceMembers } = await db();
    await database
      .update(workspaces)
      .set({ allowPublicDocuments: true })
      .where(eq(workspaces.id, owner.workspaceId));
    await database
      .insert(workspaceMembers)
      .values({ workspaceId: owner.workspaceId, userId: member.userId, role: "member", status: "active" });

    const project = await request(app)
      .post("/api/v1/projects")
      .set(authHeaders(owner.apiKey))
      .send({ workspaceId: owner.workspaceId, name: "Launch" });
    expect(project.status).toBe(201);

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(owner.apiKey))
      .send({
        title: "Launch plan",
        slug: "launch-plan",
        markdown: MARKDOWN,
        workspaceId: owner.workspaceId,
        visibility: "public",
        confirmPublic: true,
      });
    const inProject = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(owner.apiKey))
      .send({
        title: "Launch plan",
        slug: "launch-plan",
        markdown: MARKDOWN,
        workspaceId: owner.workspaceId,
        projectId: project.body.project.id,
        visibility: "public",
        confirmPublic: true,
      });
    expect(published.status).toBe(201);
    expect(inProject.status).toBe(201);

    // Reader-facing: the article's Markdown button, for anyone (signed in or not).
    for (const path of [
      `/api/v1/public/posts/${owner.workspaceSlug}/launch-plan/raw`,
      `/api/v1/public/posts/${owner.workspaceSlug}/projects/${project.body.project.slug}/launch-plan/raw`,
    ]) {
      for (const agent of [request(app), owner.agent]) {
        const raw = await agent.get(path);
        expect(raw.status).toBe(200);
        expect(raw.text).toContain("We ship in May.");
        expect(raw.text).toContain("Questions go to the launch channel.");
        expect(raw.text).not.toContain("Budget ceiling");
        expect(raw.text).not.toContain("```private");
      }
    }

    const zipResponse = await request(app)
      .get(`/api/v1/public/workspaces/${owner.workspaceSlug}/markdown.zip`)
      .buffer(true)
      .parse(parseBinary);
    expect(zipResponse.status).toBe(200);
    const zip = await JSZip.loadAsync(zipResponse.body as Buffer);
    for (const name of ["launch-plan.md", `${project.body.project.slug}/launch-plan.md`]) {
      const content = await zip.file(name)!.async("string");
      expect(content).toContain("We ship in May.");
      expect(content).not.toContain("Budget ceiling");
    }

    // The workspace search index readers download holds only page text.
    const { getWorkspaceSearchIndex } = await import("@opendocs/shared/workspaces/service");
    const index = await getWorkspaceSearchIndex(owner.workspaceSlug, null);
    expect(index.items.length).toBeGreaterThan(0);
    for (const item of index.items) {
      expect(item.body).toContain("We ship in May.");
      expect(item.body).not.toContain("Budget ceiling");
    }

    // People who may edit the document get the full source.
    for (const editor of [owner, member]) {
      const raw = await request(app)
        .get(`/api/v1/posts/${published.body.postId}/raw`)
        .set(authHeaders(editor.apiKey));
      expect(raw.status).toBe(200);
      expect(raw.body.markdown).toContain("Budget ceiling");
      const version = await request(app)
        .get(`/api/v1/posts/${published.body.postId}/versions/1/raw`)
        .set(authHeaders(editor.apiKey));
      expect(version.body.markdown).toContain("Budget ceiling");
    }

    // A signed-in reader from outside the workspace can read the public
    // document through the API, but not the author's notes.
    const outsiderRaw = await request(app)
      .get(`/api/v1/posts/${published.body.postId}/raw`)
      .set(authHeaders(outsider.apiKey));
    expect(outsiderRaw.status).toBe(200);
    expect(outsiderRaw.body.markdown).toContain("We ship in May.");
    expect(outsiderRaw.body.markdown).not.toContain("Budget ceiling");
    const outsiderVersion = await request(app)
      .get(`/api/v1/posts/${published.body.postId}/versions/1/raw`)
      .set(authHeaders(outsider.apiKey));
    expect(outsiderVersion.status).toBe(200);
    expect(outsiderVersion.body.markdown).not.toContain("Budget ceiling");
  });
});
