import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import JSZip from "jszip";
import { eq } from "drizzle-orm";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";
import { startMockConverter, type MockConverter } from "../test-helpers/mock-converter";

async function setPlan(userId: string, plan: "free" | "pro") {
  const [{ db }, { user }] = await Promise.all([import("@opendocs/shared/db"), import("@opendocs/shared/db/schema")]);
  if (!db) throw new Error("Database is not initialized.");
  await db.update(user).set({ plan }).where(eq(user.id, userId));
}

async function upgradeToPro(userId: string) {
  await setPlan(userId, "pro");
}

async function addMember(workspaceId: string, userId: string) {
  const [{ db }, { workspaceMembers }] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
  ]);
  if (!db) throw new Error("Database is not initialized.");
  await db.insert(workspaceMembers).values({ workspaceId, userId, role: "member", status: "active" });
}

function parseManifest(res: { headers: Record<string, unknown> }) {
  return JSON.parse(
    Buffer.from(res.headers["x-batch-manifest"] as string, "base64").toString("utf8"),
  ) as {
    summary: { total: number; succeeded: number; failed: number };
    results: Array<{ postId: string; success: boolean; error?: string }>;
  };
}

type PublishedPost = {
  postId: string;
  slug: string;
  title: string;
};

async function publishPost(
  apiKey: string,
  workspaceId: string,
  overrides: {
    title: string;
    markdown?: string;
    tags?: string[];
    visibility?: "private" | "workspace";
  } = { title: "Doc" },
): Promise<PublishedPost> {
  const app = await getTestApp();
  const res = await request(app)
    .post("/api/v1/publish")
    .set(authHeaders(apiKey))
    .send({
      title: overrides.title,
      markdown: overrides.markdown ?? `# ${overrides.title}\n\nBody`,
      workspaceId,
      visibility: overrides.visibility ?? "workspace",
      tags: overrides.tags ?? [],
    });

  if (res.status !== 201) {
    throw new Error(`publish failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { postId: res.body.postId, slug: res.body.slug, title: res.body.title };
}

describe("export endpoints", () => {
  let converter: MockConverter;
  const originalConverterUrl = process.env.DOC_CONVERTER_URL;

  beforeAll(async () => {
    converter = await startMockConverter();
    process.env.DOC_CONVERTER_URL = converter.url;
  });

  afterAll(async () => {
    await converter.close();
    if (originalConverterUrl === undefined) {
      delete process.env.DOC_CONVERTER_URL;
    } else {
      process.env.DOC_CONVERTER_URL = originalConverterUrl;
    }
  });

  beforeEach(() => {
    converter.calls.length = 0;
    // Reset to default success behavior in case a prior test swapped it out.
    converter.setHandler(({ format, body }) => {
      const filename = `${(body as { filename?: string }).filename ?? "document"}.${format}`;
      return {
        kind: "success",
        bytes: Buffer.from(`mock-${format}-${filename}`),
        contentType:
          format === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf",
        filename,
      };
    });
  });

  describe("POST /api/v1/posts/:postId/export/:format", () => {
    it("requires authentication", async () => {
      const app = await getTestApp();
      const res = await request(app).post("/api/v1/posts/any/export/pdf").send({});
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: "unauthorized" });
    });

    it("returns 404 for an unknown format (e.g. /export/md)", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      const post = await publishPost(user.apiKey, user.workspaceId, { title: "Format Test" });

      const res = await request(app)
        .post(`/api/v1/posts/${post.postId}/export/md`)
        .set(authHeaders(user.apiKey))
        .send({});

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: "not_found" });
      expect(converter.calls).toHaveLength(0);
    });

    it("returns 404 when the post does not exist", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();

      const res = await request(app)
        .post("/api/v1/posts/00000000-0000-0000-0000-000000000000/export/pdf")
        .set(authHeaders(user.apiKey))
        .send({});

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: "not_found" });
    });

    it("returns 404 when the requester does not own the post", async () => {
      const app = await getTestApp();
      const owner = await createOnboardedUser();
      const intruder = await createOnboardedUser();
      const post = await publishPost(owner.apiKey, owner.workspaceId, { title: "Mine" });

      const res = await request(app)
        .post(`/api/v1/posts/${post.postId}/export/pdf`)
        .set(authHeaders(intruder.apiKey))
        .send({});

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: "not_found" });
      expect(converter.calls).toHaveLength(0);
    });

    it("rejects an invalid accent_color before calling the converter", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      const post = await publishPost(user.apiKey, user.workspaceId, { title: "Accent" });

      const res = await request(app)
        .post(`/api/v1/posts/${post.postId}/export/pdf`)
        .set(authHeaders(user.apiKey))
        .send({ accent_color: "not-a-hex" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_request");
      expect(converter.calls).toHaveLength(0);
    });

    it("renders a branding sample PDF with the workspace's saved branding", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser({ workspaceName: "Sample Co" });
      const [{ db }, { workspaces }] = await Promise.all([import("@opendocs/shared/db"), import("@opendocs/shared/db/schema")]);
      await db!.update(workspaces).set({ brandColor: "#6E1F2A", exportFontMain: "Vollkorn" }).where(eq(workspaces.id, user.workspaceId));

      const res = await request(app)
        .get("/api/v1/workspace/branding/sample.pdf")
        .query({ workspaceId: user.workspaceId })
        .set(authHeaders(user.apiKey))
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => done(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      const body = converter.calls[0].body as { markdown: string; accent_color?: string; branding?: Record<string, unknown> };
      expect(converter.calls[0].format).toBe("pdf");
      expect(body.markdown).toContain("Why well-branded documents matter");
      expect(body.markdown).toContain("Sample Co");
      expect(body.accent_color).toBe("#6E1F2A");
      expect(body.branding).toMatchObject({ font_main: "Vollkorn", footer_subtitle: "Made with OpenDocs" });

      const stranger = await createOnboardedUser();
      const denied = await request(app)
        .get("/api/v1/workspace/branding/sample.pdf")
        .query({ workspaceId: user.workspaceId })
        .set(authHeaders(stranger.apiKey));
      expect(denied.status).toBe(404);
    });

    it("refuses Word export on the Free plan", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      const post = await publishPost(user.apiKey, user.workspaceId, { title: "Free DOCX" });

      const res = await request(app)
        .post(`/api/v1/posts/${post.postId}/export/docx`)
        .set(authHeaders(user.apiKey))
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("docx_requires_pro");
      expect(converter.calls).toHaveLength(0);
    });

    it("keeps the OpenDocs footer on the Free plan", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      const post = await publishPost(user.apiKey, user.workspaceId, { title: "Free PDF" });

      const res = await request(app)
        .post(`/api/v1/posts/${post.postId}/export/pdf`)
        .set(authHeaders(user.apiKey))
        .send({ accent_color: "#B91C1C", branding: { company_name: "", footer_subtitle: null } });

      expect(res.status).toBe(200);
      const body = converter.calls[0].body as { accent_color?: string; branding?: Record<string, unknown> };
      // Free can pick its color, but can't strip the footer.
      expect(body.accent_color).toBe("#B91C1C");
      expect(body.branding).toMatchObject({ company_name: "OpenDocs", footer_subtitle: "Made with OpenDocs" });
    });

    it("uses the OpenDocs footer for a Free workspace that kept a custom footer from Pro", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      const [{ db }, { workspaces }] = await Promise.all([import("@opendocs/shared/db"), import("@opendocs/shared/db/schema")]);
      await db!
        .update(workspaces)
        .set({ exportFooterCompanyName: "Acme", exportFooterTagline: "Our own footer", brandColor: "#123456" })
        .where(eq(workspaces.id, user.workspaceId));
      const post = await publishPost(user.apiKey, user.workspaceId, { title: "Downgraded PDF" });

      const res = await request(app)
        .post(`/api/v1/posts/${post.postId}/export/pdf`)
        .set(authHeaders(user.apiKey))
        .send({});

      expect(res.status).toBe(200);
      const body = converter.calls[0].body as { accent_color?: string; branding?: Record<string, unknown> };
      expect(body.accent_color).toBe("#123456");
      expect(body.branding).toMatchObject({ company_name: "OpenDocs", footer_subtitle: "Made with OpenDocs" });
    });

    it("returns the rendered docx with the converter's filename and content type", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      await upgradeToPro(user.userId);
      const post = await publishPost(user.apiKey, user.workspaceId, {
        title: "DOCX Doc",
        markdown: "# DOCX Doc\n\nHello",
      });

      const res = await request(app)
        .post(`/api/v1/posts/${post.postId}/export/docx`)
        .set(authHeaders(user.apiKey))
        .send({})
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => done(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      expect(res.headers["content-disposition"]).toContain(`${post.slug}.docx`);
      expect((res.body as Buffer).toString("utf8")).toContain("mock-docx-");

      // Confirms the converter client forwarded the doc's raw markdown and
      // defaulted the filename to the slug when the caller didn't override it.
      expect(converter.calls).toHaveLength(1);
      const call = converter.calls[0];
      expect(call.format).toBe("docx");
      const body = call.body as { markdown: string; filename: string };
      expect(body.markdown).toContain("Hello");
      expect(body.filename).toBe(post.slug);
    });

    it("never sends private blocks to the converter", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      const post = await publishPost(user.apiKey, user.workspaceId, {
        title: "Private Notes",
        markdown: "# Private Notes\n\nPublic text.\n\n```private\nSecret plan.\n```\n\nMore public text.",
      });

      const res = await request(app)
        .post(`/api/v1/posts/${post.postId}/export/pdf`)
        .set(authHeaders(user.apiKey))
        .send({});

      expect(res.status).toBe(200);
      const body = converter.calls[0].body as { markdown: string };
      expect(body.markdown).toContain("Public text.");
      expect(body.markdown).toContain("More public text.");
      expect(body.markdown).not.toContain("Secret plan.");
    });

    it("returns the rendered pdf with landscape and branding passed through", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      await upgradeToPro(user.userId);
      const post = await publishPost(user.apiKey, user.workspaceId, { title: "PDF Doc" });

      const res = await request(app)
        .post(`/api/v1/posts/${post.postId}/export/pdf`)
        .set(authHeaders(user.apiKey))
        .send({
          landscape: true,
          accent_color: "#B91C1C",
          filename: "custom-name",
          branding: { footer_text: "Hello" },
        })
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => done(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");

      expect(converter.calls).toHaveLength(1);
      const body = converter.calls[0].body as {
        filename: string;
        landscape: boolean;
        accent_color: string;
        branding: { footer_text: string };
      };
      expect(body.filename).toBe("custom-name");
      expect(body.landscape).toBe(true);
      expect(body.accent_color).toBe("#B91C1C");
      // Workspace export defaults (from `resolveExportBranding`) layer under
      // the caller body, so the converter receives additional fields like
      // `company_name` derived from the workspace name. We only assert that
      // the caller's field survives the merge — not that it's the only key.
      expect(body.branding).toMatchObject({ footer_text: "Hello" });
    });

    it("exports a downgraded workspace with its branding but the OpenDocs footer, keeping its footer for later", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      await upgradeToPro(user.userId);
      const branded = await request(app)
        .patch("/api/v1/workspace/branding")
        .set(authHeaders(user.apiKey))
        .send({ workspaceId: user.workspaceId, brandColor: "#0B3D5C", font: "Inter", footer: { enabled: false } });
      expect(branded.status).toBe(200);
      const post = await publishPost(user.apiKey, user.workspaceId, { title: "Downgrade Doc" });

      type ConvertBody = { accent_color?: string; branding?: Record<string, unknown> };
      const exportPdf = async () => {
        converter.calls.length = 0;
        const res = await request(app)
          .post(`/api/v1/posts/${post.postId}/export/pdf`)
          .set(authHeaders(user.apiKey))
          .send({});
        expect(res.status).toBe(200);
        return converter.calls[0].body as ConvertBody;
      };

      const pro = await exportPdf();
      expect(pro.accent_color).toBe("#0B3D5C");
      expect(pro.branding).toMatchObject({ font_main: "Inter", company_name: "", footer_subtitle: null });

      await setPlan(user.userId, "free");
      const free = await exportPdf();
      // Color and font are free; only the footer goes back to OpenDocs.
      expect(free.accent_color).toBe("#0B3D5C");
      expect(free.branding).toMatchObject({
        font_main: "Inter",
        company_name: "OpenDocs",
        footer_subtitle: "Made with OpenDocs",
        company_url: "https://opendocs.cc/?utm_source=pdf&utm_medium=export",
        company_url_label: "opendocs.cc",
      });

      // Batch exports follow the same rule.
      converter.calls.length = 0;
      const batch = await request(app)
        .post("/api/v1/posts/batch/export")
        .set(authHeaders(user.apiKey))
        .send({ postIds: [post.postId], format: "pdf" });
      expect(batch.status).toBe(200);
      expect((converter.calls[0].body as ConvertBody).branding).toMatchObject({
        company_name: "OpenDocs",
        footer_subtitle: "Made with OpenDocs",
      });

      // The cache key covers the branding that was actually applied, so a
      // cached Pro export is never served to the downgraded workspace.
      const { computeExportCacheKey } = await import("../lib/export-cache");
      const key = (body: ConvertBody) =>
        computeExportCacheKey({
          workspaceId: user.workspaceId,
          format: "pdf",
          landscape: false,
          rawMarkdown: "# Downgrade Doc\n\nBody",
          resolvedBranding: body.branding,
          resolvedAccentColor: body.accent_color,
        });
      expect(key(free)).not.toBe(key(pro));

      // The branding API reports the footer Free exports print; the stored
      // footer is untouched and comes back with an upgrade.
      const stored = await request(app)
        .get("/api/v1/workspace/branding")
        .query({ workspaceId: user.workspaceId })
        .set(authHeaders(user.apiKey));
      expect(stored.body.branding).toMatchObject({
        brandColor: "#0B3D5C",
        font: "Inter",
        footer: { enabled: true, tagline: "Made with OpenDocs" },
      });
      await upgradeToPro(user.userId);
      const again = await exportPdf();
      expect(again.accent_color).toBe("#0B3D5C");
      expect(again.branding).toMatchObject({ font_main: "Inter", company_name: "" });
    });

    it("maps a 5xx from the converter to 502 export_failed", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      const post = await publishPost(user.apiKey, user.workspaceId, { title: "Will Fail" });

      converter.setHandler(() => ({
        kind: "error",
        status: 500,
        body: JSON.stringify({ error: "libreoffice_crashed" }),
        contentType: "application/json",
      }));

      const res = await request(app)
        .post(`/api/v1/posts/${post.postId}/export/pdf`)
        .set(authHeaders(user.apiKey))
        .send({});

      expect(res.status).toBe(502);
      expect(res.body.error).toBe("export_failed");
      expect(res.body.message).toBe("Document converter failed.");
    });
  });

  describe("POST /api/v1/posts/batch/export", () => {
    it("requires authentication", async () => {
      const app = await getTestApp();
      const res = await request(app)
        .post("/api/v1/posts/batch/export")
        .send({ postIds: ["anything"], format: "pdf" });
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: "unauthorized" });
    });

    it("rejects an empty postIds array", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      const res = await request(app)
        .post("/api/v1/posts/batch/export")
        .set(authHeaders(user.apiKey))
        .send({ postIds: [], format: "pdf" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_request");
    });

    it("rejects more than 10 postIds per batch", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();

      const res = await request(app)
        .post("/api/v1/posts/batch/export")
        .set(authHeaders(user.apiKey))
        .send({
          postIds: Array.from({ length: 11 }, (_, i) => `id-${i}`),
          format: "pdf",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_request");
    });

    it("rejects an unknown format", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      const res = await request(app)
        .post("/api/v1/posts/batch/export")
        .set(authHeaders(user.apiKey))
        .send({ postIds: ["any"], format: "md" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_request");
    });

    it("zips every successful conversion and includes a manifest", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      await upgradeToPro(user.userId);
      const postA = await publishPost(user.apiKey, user.workspaceId, { title: "Alpha" });
      const postB = await publishPost(user.apiKey, user.workspaceId, { title: "Bravo" });

      const res = await request(app)
        .post("/api/v1/posts/batch/export")
        .set(authHeaders(user.apiKey))
        .send({ postIds: [postA.postId, postB.postId], format: "docx" })
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => done(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/zip");
      expect(res.headers["content-disposition"]).toContain("opendocs-export-");
      expect(res.headers["x-batch-manifest"]).toBeTruthy();

      // The in-header manifest must parse as base64 JSON and match the summary.
      const headerManifest = JSON.parse(
        Buffer.from(res.headers["x-batch-manifest"] as string, "base64").toString("utf8"),
      ) as {
        format: string;
        summary: { total: number; succeeded: number; failed: number };
        results: Array<{ postId: string; success: boolean; filename?: string }>;
      };
      expect(headerManifest.format).toBe("docx");
      expect(headerManifest.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
      expect(headerManifest.results.map((r) => r.postId).sort()).toEqual(
        [postA.postId, postB.postId].sort(),
      );

      // The zip must contain both files plus manifest.json.
      const zip = await JSZip.loadAsync(res.body as Buffer);
      const entries = Object.keys(zip.files).sort();
      expect(entries).toContain("manifest.json");
      expect(entries).toContain(`${postA.slug}.docx`);
      expect(entries).toContain(`${postB.slug}.docx`);

      const innerManifest = JSON.parse(await zip.file("manifest.json")!.async("string")) as {
        summary: { total: number; succeeded: number; failed: number };
      };
      expect(innerManifest.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });

      expect(converter.calls).toHaveLength(2);
      expect(converter.calls.every((c) => c.format === "docx")).toBe(true);
    });

    it("exports a teammate's workspace documents, but not their private ones or another workspace's", async () => {
      const app = await getTestApp();
      const author = await createOnboardedUser();
      const member = await createOnboardedUser();
      const stranger = await createOnboardedUser();
      await addMember(author.workspaceId, member.userId);
      const shared = await publishPost(author.apiKey, author.workspaceId, { title: "Team Spec" });
      const drafts = await publishPost(author.apiKey, author.workspaceId, {
        title: "Author Drafts",
        visibility: "private",
      });
      const foreign = await publishPost(stranger.apiKey, stranger.workspaceId, { title: "Foreign Spec" });

      const res = await request(app)
        .post("/api/v1/posts/batch/export")
        .set(authHeaders(member.apiKey))
        .send({
          postIds: [shared.slug, drafts.postId, drafts.slug, foreign.postId, foreign.slug],
          format: "pdf",
          workspaceId: author.workspaceId,
        });

      expect(res.status).toBe(200);
      const manifest = parseManifest(res);
      expect(manifest.summary).toEqual({ total: 5, succeeded: 1, failed: 4 });
      expect(manifest.results.find((r) => r.success)?.postId).toBe(shared.postId);
      expect(manifest.results.filter((r) => !r.success).every((r) => r.error === "not_found")).toBe(true);
      expect(converter.calls).toHaveLength(1);

      // The single-document export follows the same rule.
      const single = await request(app)
        .post(`/api/v1/posts/${shared.slug}/export/pdf`)
        .query({ workspaceId: author.workspaceId })
        .set(authHeaders(member.apiKey))
        .send({});
      expect(single.status).toBe(200);
    });

    it("records not_found entries in the manifest without aborting the batch", async () => {
      const app = await getTestApp();
      const owner = await createOnboardedUser();
      const stranger = await createOnboardedUser();
      const mine = await publishPost(owner.apiKey, owner.workspaceId, { title: "Mine" });
      const theirs = await publishPost(stranger.apiKey, stranger.workspaceId, {
        title: "Theirs",
      });

      const res = await request(app)
        .post("/api/v1/posts/batch/export")
        .set(authHeaders(owner.apiKey))
        .send({
          postIds: [mine.postId, theirs.postId, "00000000-0000-0000-0000-000000000000"],
          format: "pdf",
        })
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => done(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      const manifest = JSON.parse(
        Buffer.from(res.headers["x-batch-manifest"] as string, "base64").toString("utf8"),
      ) as {
        summary: { total: number; succeeded: number; failed: number };
        results: Array<{
          postId: string;
          success: boolean;
          error?: string;
        }>;
      };
      expect(manifest.summary).toEqual({ total: 3, succeeded: 1, failed: 2 });
      const successes = manifest.results.filter((r) => r.success);
      const failures = manifest.results.filter((r) => !r.success);
      expect(successes.map((r) => r.postId)).toEqual([mine.postId]);
      expect(failures.every((f) => f.error === "not_found")).toBe(true);

      // Converter should only have been called for the post the caller owns.
      expect(converter.calls).toHaveLength(1);
    });

    it("maps a converter 5xx to converter_failed inside the manifest without aborting the batch", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      const postA = await publishPost(user.apiKey, user.workspaceId, { title: "Aye" });
      const postB = await publishPost(user.apiKey, user.workspaceId, { title: "Bee" });

      // First call succeeds, second call 500s — proves the loop keeps going.
      let seen = 0;
      converter.setHandler(({ format, body }) => {
        seen += 1;
        if (seen === 2) {
          return { kind: "error", status: 500, body: "boom" };
        }
        const filename = `${(body as { filename?: string }).filename ?? "doc"}.${format}`;
        return { kind: "success", bytes: Buffer.from("ok"), filename };
      });

      const res = await request(app)
        .post("/api/v1/posts/batch/export")
        .set(authHeaders(user.apiKey))
        .send({ postIds: [postA.postId, postB.postId], format: "pdf" })
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => done(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      const manifest = JSON.parse(
        Buffer.from(res.headers["x-batch-manifest"] as string, "base64").toString("utf8"),
      ) as {
        summary: { total: number; succeeded: number; failed: number };
        results: Array<{ postId: string; success: boolean; error?: string; message?: string }>;
      };
      expect(manifest.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
      const failure = manifest.results.find((r) => !r.success)!;
      expect(failure.error).toBe("converter_failed");
      expect(failure.message).toBe("Document converter failed.");
    });
  });
});
