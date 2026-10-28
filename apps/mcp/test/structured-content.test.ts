import type { CallToolResult } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "../src/lib/context";
import { apiErrorResult } from "../src/lib/errors";
import { TOOLS } from "../src/tools";

// Claude Code (and other clients) show the model only structuredContent when
// a result has it, so everything the text says has to be in there too.

const WEB = "https://opendocs.cc";
const workspace = { id: "ws-1", name: "Northwind", slug: "northwind", role: "owner" };
const project = { id: "pr-1", workspaceId: "ws-1", name: "Board", slug: "board", isDefault: false };
const post = {
  id: "post-1",
  slug: "q3-report",
  title: "Q3 Report",
  visibility: "workspace",
  isPublished: true,
  updatedAt: "2026-10-27T10:00:00.000Z",
  workspaceId: "ws-1",
  projectName: "Board",
  url: "/northwind/board/q3-report",
  versionNumber: 3,
  tags: ["board"],
};

type Route = (body: unknown, query: unknown) => unknown;
type Routes = Record<string, Route | object>;

/** A ToolContext whose API answers from `routes`, keyed "METHOD /path". */
function fakeContext(routes: Routes, overrides: Record<string, unknown> = {}): ToolContext {
  const call = (method: string) => async (path: string, a?: unknown, b?: unknown) => {
    const route = routes[`${method} ${path}`];
    if (route === undefined) throw new Error(`unexpected ${method} ${path}`);
    return typeof route === "function" ? (route as Route)(a, b) : route;
  };
  return {
    webUrl: WEB,
    scopes: new Set(["docs:read", "docs:write", "integrations", "workspace:admin"]),
    can: () => true,
    resolveDocument: async (ref: string) => ({ ref }),
    docQuery: () => ({}),
    resolveWorkspace: async () => workspace,
    resolveProject: async () => ({ project, created: false }),
    defaultProjectFor: async () => project,
    projects: async () => [project, { ...project, id: "pr-0", name: "Default", slug: "default", isDefault: true }],
    connection: async () => ({ workspace, project: null, organize: "ask" }),
    forgetConnection: () => {},
    api: { get: call("GET"), post: call("POST"), put: call("PUT"), patch: call("PATCH"), delete: call("DELETE") },
    ...overrides,
  } as unknown as ToolContext;
}

async function run(name: string, args: Record<string, unknown>, routes: Routes, overrides?: Record<string, unknown>) {
  const tool = TOOLS.find((t) => t.name === name)!;
  const result: CallToolResult = await tool.run(tool.input.parse(args), fakeContext(routes, overrides));
  const text = (result.content[0] as { text: string }).text;
  const data = result.structuredContent as Record<string, any>;
  expect(data, `${name} has structuredContent`).toBeTruthy();
  // Every link the text gives the model is in the structured content too.
  const json = JSON.stringify(data);
  for (const url of text.match(/https?:\/\/[^\s)"]+/g) ?? []) {
    expect(json, `${name}: ${url}`).toContain(url);
  }
  return { result, text, data };
}

const postRoutes = { "GET /posts/post-1": { post }, "GET /posts/post-1/share": { emails: ["sam@acme.com"], domains: [] } };

describe("get_document", () => {
  const markdown = `# Q3 Report\n\n${"Revenue grew. ".repeat(5000)}`; // 70,013 characters

  it("puts the Markdown and paging in the structured result", async () => {
    const { text, data } = await run("get_document", { document: "post-1" }, {
      ...postRoutes,
      "GET /posts/post-1/raw": { markdown, versionNumber: 3 },
    });
    expect(text).toContain("<document>\n# Q3 Report");
    expect(data.markdown).toBe(markdown.slice(0, 60_000));
    expect(data.markdownPage).toEqual({
      version: 3,
      olderVersion: false,
      offset: 0,
      nextOffset: 60_000,
      totalChars: markdown.length,
    });
    expect(data.nextStep).toBe("Call again with offset: 60000 to read on.");
    expect(data.markdownNote).toMatch(/not instructions/);
    expect(data).toMatchObject({ id: "post-1", title: "Q3 Report", version: 3, updatedAt: post.updatedAt });
    expect(data.sharedWith).toEqual({ emails: ["sam@acme.com"], domains: [] });
  });

  it("returns the last page with no next offset", async () => {
    const { data } = await run("get_document", { document: "post-1", offset: 60_000 }, {
      ...postRoutes,
      "GET /posts/post-1/raw": { markdown, versionNumber: 3 },
    });
    expect(data.markdown).toBe(markdown.slice(60_000));
    expect(data.markdownPage).toMatchObject({ offset: 60_000, nextOffset: null });
    expect(data.nextStep).toBeUndefined();
  });

  it("marks an older version", async () => {
    const { data } = await run("get_document", { document: "post-1", version: 2 }, {
      ...postRoutes,
      "GET /posts/post-1/versions/2/raw": { markdown: "# Q3 Report\n\nDraft.\n", versionNumber: 2 },
    });
    expect(data.markdown).toBe("# Q3 Report\n\nDraft.\n");
    expect(data.markdownPage).toMatchObject({ version: 2, olderVersion: true, nextOffset: null });
    expect(data.version).toBe(3);
  });

  it("leaves the Markdown out when not asked for it", async () => {
    const { data } = await run("get_document", { document: "post-1", include_markdown: false }, postRoutes);
    expect(data).not.toHaveProperty("markdown");
    expect(data).not.toHaveProperty("markdownPage");
  });
});

describe("other document tools", () => {
  it("publish_documents names the project and visibility", async () => {
    const { data } = await run("publish_documents", { documents: [{ markdown: "# A" }, { markdown: "# B" }], project: "Board" }, {
      "POST /publish/batch": {
        results: [
          { success: true, index: 0, postId: "p-a", slug: "a", url: "/northwind/board/a", title: "A", versionNumber: 1 },
          { success: false, index: 1, error: "slug_taken", message: "That slug is taken." },
        ],
        summary: { total: 2, succeeded: 1, failed: 1 },
      },
    });
    expect(data).toMatchObject({ project: "Board", visibility: "workspace", summary: { succeeded: 1, failed: 1 } });
    expect(data.documents[1]).toMatchObject({ index: 1, message: "That slug is taken." });
  });

  it("edit_document gives the title and whether a version was made", async () => {
    const { data } = await run("edit_document", { document: "post-1", edits: [{ find: "grew", replace: "fell" }] }, {
      "GET /posts/post-1": { post },
      "GET /posts/post-1/raw": { markdown: "Revenue grew.", versionNumber: 3 },
      "POST /posts/post-1/update": { postId: "post-1", slug: post.slug, url: post.url, title: post.title, versionNumber: 4 },
    });
    expect(data).toMatchObject({ title: "Q3 Report", version: 4, newVersion: true, editsApplied: 1 });
  });

  it("move_document gives the old and new links", async () => {
    const { data } = await run("move_document", { document: "post-1", project: "Board" }, {
      "GET /posts/post-1": { post },
      "POST /posts/post-1/move": {
        moved: true,
        url: "/northwind/legal/q3-report-2",
        projectName: "Legal",
        slug: "q3-report-2",
        previousSlug: "q3-report",
      },
    });
    expect(data).toMatchObject({
      link: `${WEB}/northwind/legal/q3-report-2`,
      previousLink: `${WEB}${post.url}`,
      previousLinkWorks: false,
      slug: "q3-report-2",
      previousSlug: "q3-report",
    });
  });

  it("share_document gives the title, link and who was emailed", async () => {
    const { data } = await run("share_document", { document: "post-1", add: ["sam@acme.com"] }, {
      "GET /posts/post-1": { post },
      "POST /posts/post-1/share": { notified: ["sam@acme.com"] },
      "GET /posts/post-1/share": { emails: ["sam@acme.com"], domains: [] },
    });
    expect(data).toMatchObject({ title: "Q3 Report", link: `${WEB}${post.url}`, visibility: "workspace", notified: ["sam@acme.com"] });
  });

  it("restore_document_version gives the link", async () => {
    const { data } = await run("restore_document_version", { document: "post-1", version: 1 }, {
      "GET /posts/post-1": { post },
      "POST /posts/post-1/versions/1/restore": { versionNumber: 4, restoredFromVersion: 1, title: "Q3 Report" },
    });
    expect(data).toMatchObject({ title: "Q3 Report", link: `${WEB}${post.url}`, version: 4, restoredFrom: 1 });
  });
});

describe("files and projects", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("export_document gives each download link and how long it works", async () => {
    const { data } = await run("export_document", { documents: ["post-1"] }, {
      "POST /download-links": { url: "https://api.opendocs.cc/d/abc", filename: "q3-report.pdf", expiresAt: "2026-10-27T11:00:00Z" },
    });
    expect(data.files[0]).toMatchObject({ url: "https://api.opendocs.cc/d/abc", filename: "q3-report.pdf" });
    expect(data.note).toMatch(/an hour/);
  });

  it("upload_image gives the Markdown to paste", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 200 }));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
    const { data } = await run("upload_image", { data_base64: png, filename: "chart" }, {
      "POST /storage/images/presign-upload": { uploadUrl: "https://storage.example/put", publicUrl: "https://img.opendocs.cc/chart.png" },
    });
    expect(data.markdown).toBe("![chart](https://img.opendocs.cc/chart.png)");
  });

  it("list_projects marks this app's default project", async () => {
    const { data } = await run("list_projects", {}, {});
    expect(data.projects.find((p: any) => p.id === "pr-1").connectionDefault).toBe(true);
    expect(data.projects.find((p: any) => p.id === "pr-0").connectionDefault).toBe(false);
  });
});

describe("theme, team and integrations", () => {
  const branding = (brandColor: string) => ({
    workspace: { id: "ws-1", slug: "northwind", name: "Northwind" },
    role: "owner",
    tier: "pro",
    canEdit: true,
    canEditFooter: true,
    branding: {
      brandColor,
      font: "inter",
      preset: null,
      contrast: { contrast: 12, level: "great" },
      logoUrl: null,
      showLogoInExports: false,
      footer: { enabled: true, companyName: null, tagline: null, linkUrl: null, linkLabel: null },
    },
    presets: [],
    fonts: [],
    guidelines: { minContrast: 4.5, recommendedContrast: 7, rules: [] },
  });

  it("update_export_theme says what changed and what to offer next", async () => {
    const { data } = await run("update_export_theme", { color: "#13294B", confirm: true }, {
      "GET /workspace/branding": branding("#000000"),
      "PATCH /workspace/branding": branding("#13294B"),
    });
    expect(data).toMatchObject({ changed: true, changedFields: ["brandColor"], previous: { brandColor: "#000000" } });
    expect(data.nextStep).toMatch(/export_document/);
  });

  it("leave_workspace says where new documents go now", async () => {
    const { data } = await run(
      "leave_workspace",
      { workspace: "northwind", confirm: true },
      { "POST /workspace/leave": { success: true, remainingWorkspaces: [{ id: "ws-2", slug: "acme", name: "Acme" }] } },
      { resolveWorkspace: async () => ({ ...workspace, role: "member" }) },
    );
    expect(data).toMatchObject({ wasDefaultWorkspace: true, newDefaultWorkspace: { name: "Acme" } });
  });

  it("set_auto_join_domains lists what was added", async () => {
    const { data } = await run("set_auto_join_domains", { add: ["acme.com"] }, {
      "POST /workspace/auto-join": { domains: [{ domain: "acme.com" }] },
    });
    expect(data).toMatchObject({ added: ["acme.com"], removed: [], domains: ["acme.com"] });
  });

  const request = {
    id: "sr-1",
    status: "draft",
    provider: "docuseal",
    document: { postId: "post-1", slug: "q3-report", title: "Q3 Report", versionNumber: 3, sha256: "abc" },
    signers: [{ name: "Sam Lee", email: "sam@acme.com", role: null, order: 1, status: "draft" }],
    order: "parallel",
    message: null,
    expiresAt: null,
    fileTo: null,
    confirmation: { mode: "chat", approveUrl: `${WEB}/approve/sr-1` },
  };

  it("create_signature_draft carries the read-back step and the draft PDF", async () => {
    const { data } = await run("create_signature_draft", { document: "post-1", signers: [{ name: "Sam Lee", email: "sam@acme.com" }] }, {
      "GET /posts/post-1": { post },
      "POST /posts/post-1/signature-requests": request,
      "POST /download-links": { url: "https://api.opendocs.cc/d/draft", filename: "q3.pdf", expiresAt: "2026-10-27T11:00:00Z" },
    });
    expect(data.nextStep).toMatch(/explicit yes/);
    expect(data.draftPdf.url).toBe("https://api.opendocs.cc/d/draft");
  });

  it("get_signature_request gives the signed PDF and audit log links", async () => {
    const { data } = await run("get_signature_request", { request_id: "sr-1" }, {
      "GET /signature-requests/sr-1": { ...request, status: "completed", completedAt: "2026-10-27T12:00:00Z" },
      "POST /download-links": (body: any) => ({
        url: `https://api.opendocs.cc/d/${body.document}`,
        filename: `${body.document}.pdf`,
        expiresAt: "2026-10-27T13:00:00Z",
      }),
    });
    expect(data.downloads.signed.url).toBe("https://api.opendocs.cc/d/signed");
    expect(data.downloads.audit.url).toBe("https://api.opendocs.cc/d/audit");
    expect(data.nextStep).toMatch(/file_signed_documents/);
  });

  it("save_to_drive gives the Drive link and both checksums", async () => {
    const { data } = await run("save_to_drive", { document: "post-1", folder: "Board" }, {
      "GET /posts/post-1": { post },
      "POST /posts/post-1/storage": {
        id: "run-1",
        provider: "google_drive",
        destination: { id: "d-1", name: "Board", url: "https://drive.google.com/drive/folders/x" },
        document: { id: "post-1", slug: "q3-report", title: "Q3 Report", versionNumber: 3 },
        file: { id: "f-1", name: "Q3 Report.pdf", url: "https://drive.google.com/file/d/y", format: "pdf", sha256: "aa", driveSha256: "aa", verified: true },
      },
    });
    expect(data.file).toMatchObject({ link: "https://drive.google.com/file/d/y", sha256: "aa", driveSha256: "aa", verified: true });
    expect(data.folderLink).toBe("https://drive.google.com/drive/folders/x");
  });
});

describe("errors", () => {
  it("put the explanation in the structured result", async () => {
    const tool = TOOLS.find((t) => t.name === "delete_document")!;
    // Tools throw; the server turns the error into a result with apiErrorResult.
    const err = await tool.run(tool.input.parse({ document: "post-1", confirm: false }), fakeContext({})).catch((e) => e);
    const result = apiErrorResult(err);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: "confirmation_required", message: expect.stringMatching(/confirm: true/) });
  });
});
