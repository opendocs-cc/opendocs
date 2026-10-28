import { describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";

describe("private fences", () => {
  const strip = async (markdown: string) =>
    (await import("@opendocs/shared/markdown/private-blocks")).stripPrivateBlocks(markdown);

  it("drops backtick, tilde and longer private fences", async () => {
    const markdown = [
      "Intro.",
      "```private",
      "three backticks",
      "```",
      "~~~private",
      "tildes",
      "~~~",
      "````private notes",
      "four backticks with ``` inside",
      "```",
      "still private",
      "````",
      "Outro.",
    ].join("\n");
    expect(await strip(markdown)).toBe("Intro.\nOutro.");
  });

  it("hides the rest of the document after an unclosed private fence", async () => {
    expect(await strip("Public.\n~~~private\nSecret.\nMore secret.")).toBe("Public.");
  });

  it("drops private fences in lists and quotes, and handles CRLF", async () => {
    expect(await strip("- Item\n  ```private\n  secret\n  ```\n- Next")).toBe("- Item\n- Next");
    expect(await strip("> Quote\n> ```private\n> secret\n> ```\n")).toBe("> Quote");
    expect(await strip("A\r\n```private\r\nsecret\r\n```\r\nB")).toBe("A\r\nB");
  });

  it("keeps a private fence shown as an example inside another code block", async () => {
    const example = "````md\n```private\nNumbers need sign-off.\n```\n````";
    expect(await strip(example)).toBe(example);
  });

  it("leaves other fences and inline code alone", async () => {
    const markdown = "```ts\nconst x = 1;\n```\nUse ```private``` fences.";
    expect(await strip(markdown)).toBe(markdown);
  });
});

describe("who can read comments", () => {
  it("is the workspace and the people a document is shared with, not public readers", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    const member = await createOnboardedUser();
    const guest = await createOnboardedUser();
    const outsider = await createOnboardedUser();
    const [{ db }, schema, comments] = await Promise.all([
      import("@opendocs/shared/db"),
      import("@opendocs/shared/db/schema"),
      import("@opendocs/shared/comments/service"),
    ]);
    if (!db) throw new Error("Database is not initialized.");
    await db
      .update(schema.workspaces)
      .set({ allowPublicDocuments: true })
      .where(eq(schema.workspaces.id, owner.workspaceId));
    await db
      .insert(schema.workspaceMembers)
      .values({ workspaceId: owner.workspaceId, userId: member.userId, role: "member", status: "active" });
    // Sharing applies to verified emails only; the email-code sign-in verifies them.
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, guest.userId));

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(owner.apiKey))
      .send({
        title: "Roadmap",
        markdown: "# Roadmap\n\nWe ship in May.",
        workspaceId: owner.workspaceId,
        visibility: "public",
        confirmPublic: true,
      });
    expect(published.status).toBe(201);
    const postId = published.body.postId as string;
    const shared = await request(app)
      .post(`/api/v1/posts/${postId}/share`)
      .set(authHeaders(owner.apiKey))
      .send({ emails: [guest.email], notify: false });
    expect(shared.status).toBeLessThan(300);

    await comments.createComment({ postId, authorUserId: member.userId, body: "Is May still realistic?" });

    for (const reader of [owner.userId, member.userId, guest.userId]) {
      const visible = await comments.listCommentsForPost(postId, reader);
      expect(visible.map((c) => c.body)).toEqual(["Is May still realistic?"]);
    }
    for (const reader of [outsider.userId, null]) {
      await expect(comments.listCommentsForPost(postId, reader)).rejects.toMatchObject({
        code: "forbidden",
        status: 403,
      });
    }
    // Reading the document itself is unaffected.
    const page = await request(app).get(`/api/v1/public/posts/${owner.workspaceSlug}/roadmap/raw`);
    expect(page.status).toBe(200);
  });
});
