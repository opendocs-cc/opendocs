import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import JSZip from "jszip";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";
import { startMockConverter, type MockConverter } from "../test-helpers/mock-converter";

// Real workflows (an agent re-exporting a folder of long documents after a
// round of edits) must fit inside the limits. This suite opts in to the
// limiters; each test sends from its own client IP so buckets don't bleed.
describe("export and publish limits", () => {
  let converter: MockConverter;
  const originalConverterUrl = process.env.DOC_CONVERTER_URL;

  beforeAll(async () => {
    process.env.OPENDOCS_TEST_RATE_LIMITS = "true";
    converter = await startMockConverter();
    process.env.DOC_CONVERTER_URL = converter.url;
  });

  afterAll(async () => {
    delete process.env.OPENDOCS_TEST_RATE_LIMITS;
    await converter.close();
    if (originalConverterUrl === undefined) {
      delete process.env.DOC_CONVERTER_URL;
    } else {
      process.env.DOC_CONVERTER_URL = originalConverterUrl;
    }
  });

  async function publishMany(apiKey: string, workspaceId: string, ip: string, count: number) {
    const app = await getTestApp();
    const ids: string[] = [];
    for (let i = 0; i < count; i += 25) {
      const documents = Array.from({ length: Math.min(25, count - i) }, (_, j) => ({
        title: `Agreement ${i + j + 1}`,
        markdown: `# Agreement ${i + j + 1}\n\nClause text.`,
        workspaceId,
        visibility: "workspace",
      }));
      const res = await request(app)
        .post("/api/v1/publish/batch")
        .set(authHeaders(apiKey))
        .set("X-Forwarded-For", ip)
        .send({ documents });
      expect(res.status).toBe(207);
      ids.push(...(res.body.results as Array<{ postId: string }>).map((r) => r.postId));
    }
    return ids;
  }

  it("lets one account publish 50 documents and export them all in back-to-back batches", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();
    const ip = "198.51.100.10";
    const ids = await publishMany(user.apiKey, user.workspaceId, ip, 50);
    expect(ids).toHaveLength(50);

    // What the CLI does: batches of 10, one after another, as fast as the
    // server answers. The old 3-per-minute limit refused batch 4.
    let exported = 0;
    for (let i = 0; i < ids.length; i += 10) {
      const res = await request(app)
        .post("/api/v1/posts/batch/export")
        .set(authHeaders(user.apiKey))
        .set("X-Forwarded-For", ip)
        .send({ postIds: ids.slice(i, i + 10), format: "pdf" })
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => callback(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers["ratelimit-limit"]).toBe("30");
      const zip = await JSZip.loadAsync(res.body as Buffer);
      exported += Object.keys(zip.files).filter((name) => name.endsWith(".pdf")).length;
    }
    expect(exported).toBe(50);
  });

  it("limits signed-in exports per account, so people behind one office IP don't share a bucket", async () => {
    const app = await getTestApp();
    const [first, second] = [await createOnboardedUser(), await createOnboardedUser()];
    const ip = "198.51.100.20";
    const exportAs = (apiKey: string) =>
      request(app)
        .post("/api/v1/posts/missing/export/pdf")
        .set(authHeaders(apiKey))
        .set("X-Forwarded-For", ip)
        .send({});

    await exportAs(first.apiKey);
    const firstAgain = await exportAs(first.apiKey);
    const secondUser = await exportAs(second.apiKey);

    expect(firstAgain.headers["ratelimit-limit"]).toBe("120");
    expect(firstAgain.headers["ratelimit-remaining"]).toBe("118");
    expect(secondUser.headers["ratelimit-remaining"]).toBe("119");
  });

  it("returns 429 with Retry-After once the batch export bucket is used up", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();
    const ip = "198.51.100.30";
    const [postId] = await publishMany(user.apiKey, user.workspaceId, ip, 1);
    const batchExport = () =>
      request(app)
        .post("/api/v1/posts/batch/export")
        .set(authHeaders(user.apiKey))
        .set("X-Forwarded-For", ip)
        .send({ postIds: [postId], format: "pdf" });

    for (let i = 0; i < 30; i += 1) {
      expect((await batchExport()).status).toBe(200);
    }
    const blocked = await batchExport();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ error: "rate_limited" });
    const retryAfter = Number(blocked.headers["retry-after"]);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("caps exports running at once per account and frees the slot when one finishes", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();
    const ip = "198.51.100.40";
    const [postId] = await publishMany(user.apiKey, user.workspaceId, ip, 1);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    converter.setHandler(async ({ format }) => {
      await gate;
      return { kind: "success", bytes: Buffer.from(`mock-${format}`), filename: `doc.${format}` };
    });
    converter.calls.length = 0;

    const exportOnce = () =>
      request(app)
        .post(`/api/v1/posts/${postId}/export/pdf`)
        .set(authHeaders(user.apiKey))
        .set("X-Forwarded-For", ip)
        .send({});

    const running = Array.from({ length: 4 }, () => exportOnce().then((res) => res));
    for (let i = 0; i < 100 && converter.calls.length < 4; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(converter.calls).toHaveLength(4);

    const fifth = await exportOnce();
    expect(fifth.status).toBe(429);
    expect(fifth.headers["retry-after"]).toBe("2");
    expect(fifth.body).toMatchObject({ error: "rate_limited" });

    // Another account isn't affected by this one's running exports.
    const other = await createOnboardedUser();
    const otherRes = await request(app)
      .post("/api/v1/posts/missing/export/pdf")
      .set(authHeaders(other.apiKey))
      .set("X-Forwarded-For", ip)
      .send({});
    expect(otherRes.status).not.toBe(429);

    release();
    const finished = await Promise.all(running);
    expect(finished.map((res) => res.status)).toEqual([200, 200, 200, 200]);
    expect((await exportOnce()).status).toBe(200);
  });
});
