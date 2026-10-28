import { describe, expect, it } from "vitest";
import request from "supertest";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";

const OVER_TWO_MB = Buffer.alloc(2 * 1024 * 1024 + 1, "a");

describe("client errors answer 4xx, not 500", () => {
  it("rejects an oversized or malformed JSON body", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();

    const tooLarge = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({ markdown: `# Big\n\n${"x".repeat(2 * 1024 * 1024)}`, workspaceId: user.workspaceId });
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body).toMatchObject({
      error: "payload_too_large",
      docs_url: "https://docs.opendocs.cc/errors#payload-too-large",
    });

    const malformed = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .set("Content-Type", "application/json")
      .send('{"markdown": "# Oops", ');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({
      error: "invalid_request",
      message: "The request body isn't valid JSON.",
    });
  });

  it("rejects uploads over the size limit or of the wrong type", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();

    const logo = await request(app)
      .post("/api/v1/workspace/logo/upload")
      .set(authHeaders(user.apiKey))
      .field("workspaceId", user.workspaceId)
      .attach("file", OVER_TWO_MB, { filename: "logo.png", contentType: "image/png" });
    expect(logo.status).toBe(413);
    expect(logo.body).toMatchObject({ error: "file_too_large", message: "Logo must be 2 MB or smaller." });

    const avatar = await user.agent
      .post("/api/v1/profile/avatar/upload")
      .attach("file", OVER_TWO_MB, { filename: "me.png", contentType: "image/png" });
    expect(avatar.status).toBe(413);
    expect(avatar.body).toMatchObject({ error: "file_too_large", message: "Avatar must be 2 MB or smaller." });

    const markdown = await request(app)
      .post("/api/v1/tools/convert/pdf")
      .attach("file", OVER_TWO_MB, { filename: "notes.md", contentType: "text/markdown" });
    expect(markdown.status).toBe(413);
    expect(markdown.body.error).toBe("file_too_large");

    const wrongType = await request(app)
      .post("/api/v1/tools/convert/pdf")
      .attach("file", Buffer.from("not markdown"), { filename: "photo.png", contentType: "image/png" });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body).toMatchObject({
      error: "unsupported_mime",
      message: "Only .md / .markdown files are accepted.",
    });
  });

  it("answers 409 slug_taken for a project slug that's in use", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();
    const create = () =>
      request(app)
        .post("/api/v1/projects")
        .set(authHeaders(user.apiKey))
        .send({ workspaceId: user.workspaceId, name: "Operations", slug: "ops" });

    expect((await create()).status).toBe(201);
    const taken = await create();
    expect(taken.status).toBe(409);
    expect(taken.body.error).toBe("slug_taken");

    // Without an explicit slug the name still gets a free one.
    const derived = await request(app)
      .post("/api/v1/projects")
      .set(authHeaders(user.apiKey))
      .send({ workspaceId: user.workspaceId, name: "Ops" });
    expect(derived.status).toBe(201);
    expect(derived.body.project.slug).toMatch(/^ops-\d+$/);
  });
});
