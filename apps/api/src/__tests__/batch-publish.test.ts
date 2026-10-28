import { describe, expect, it } from "vitest";
import request from "supertest";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";

describe("POST /api/v1/publish/batch", () => {
  it("requires authentication", async () => {
    const app = await getTestApp();

    const res = await request(app).post("/api/v1/publish/batch").send({
      documents: [
        {
          title: "No auth",
          markdown: "# hi",
          workspaceId: "does-not-matter",
        },
      ],
    });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthorized" });
  });

  it("rejects an empty documents array", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();

    const res = await request(app)
      .post("/api/v1/publish/batch")
      .set(authHeaders(user.apiKey))
      .send({ documents: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("rejects more than 25 documents per batch", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();

    const documents = Array.from({ length: 26 }, (_, i) => ({
      title: `Doc ${i}`,
      markdown: `# Doc ${i}\n\nBody ${i}`,
      workspaceId: user.workspaceId,
      visibility: "workspace" as const,
    }));

    const res = await request(app)
      .post("/api/v1/publish/batch")
      .set(authHeaders(user.apiKey))
      .send({ documents });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("returns 207 with per-doc results when every doc succeeds", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();

    const documents = [
      {
        title: "Batch Doc One",
        markdown: "# One\n\nBody",
        workspaceId: user.workspaceId,
        visibility: "workspace",
        tags: ["batch"],
      },
      {
        title: "Batch Doc Two",
        markdown: "# Two\n\nBody",
        workspaceId: user.workspaceId,
        visibility: "workspace",
        tags: ["batch"],
      },
    ];

    const res = await request(app)
      .post("/api/v1/publish/batch")
      .set(authHeaders(user.apiKey))
      .send({ documents });

    expect(res.status).toBe(207);
    expect(res.body.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
    expect(res.body.results).toHaveLength(2);
    for (const result of res.body.results) {
      expect(result.success).toBe(true);
      expect(result.postId).toBeTruthy();
      expect(result.slug).toBeTruthy();
      // Public URLs use the workspace slug, not the username.
      expect(result.url).toContain(`/${user.workspaceSlug}/`);
    }
    // Indices must match input order so CLI can align error messages.
    expect(res.body.results.map((r: { index: number }) => r.index)).toEqual([0, 1]);
  });

  it("reports partial success with correct indices when one doc fails", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();

    const documents = [
      {
        title: "Valid One",
        markdown: "# Valid\n\nBody",
        workspaceId: user.workspaceId,
        visibility: "workspace",
      },
      {
        title: "Bad Workspace",
        markdown: "# Bad\n\nBody",
        workspaceId: "00000000-0000-0000-0000-000000000000",
        visibility: "workspace",
      },
      {
        title: "Valid Two",
        markdown: "# Valid 2\n\nBody",
        workspaceId: user.workspaceId,
        visibility: "workspace",
      },
    ];

    const res = await request(app)
      .post("/api/v1/publish/batch")
      .set(authHeaders(user.apiKey))
      .send({ documents });

    expect(res.status).toBe(207);
    expect(res.body.summary).toEqual({ total: 3, succeeded: 2, failed: 1 });

    const [first, middle, last] = res.body.results;
    expect(first.success).toBe(true);
    expect(first.index).toBe(0);
    expect(middle.success).toBe(false);
    expect(middle.index).toBe(1);
    expect(middle.error).toBe("publish_failed");
    expect(last.success).toBe(true);
    expect(last.index).toBe(2);
  });

  it("streams per-doc progress when Accept: text/event-stream is set", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();

    const documents = [
      {
        title: "SSE One",
        markdown: "# SSE 1\n\nBody",
        workspaceId: user.workspaceId,
        visibility: "workspace",
      },
      {
        title: "SSE Two",
        markdown: "# SSE 2\n\nBody",
        workspaceId: user.workspaceId,
        visibility: "workspace",
      },
    ];

    const res = await request(app)
      .post("/api/v1/publish/batch")
      .set(authHeaders(user.apiKey))
      .set("Accept", "text/event-stream")
      .send({ documents })
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks).toString("utf8")));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.headers["cache-control"]).toContain("no-cache");
    expect(res.headers["x-accel-buffering"]).toBe("no");

    const body = res.body as string;
    const resultFrames = [...body.matchAll(/event: result\ndata: (\{.*?\})\n\n/g)].map(
      (m) => JSON.parse(m[1]) as { success: boolean; index: number },
    );
    const summaryFrames = [...body.matchAll(/event: summary\ndata: (\{.*?\})\n\n/g)].map(
      (m) => JSON.parse(m[1]) as { total: number; succeeded: number; failed: number },
    );

    expect(resultFrames).toHaveLength(2);
    expect(resultFrames.map((r) => r.index)).toEqual([0, 1]);
    expect(resultFrames.every((r) => r.success)).toBe(true);

    expect(summaryFrames).toHaveLength(1);
    expect(summaryFrames[0]).toEqual({ total: 2, succeeded: 2, failed: 0 });
  });
});
