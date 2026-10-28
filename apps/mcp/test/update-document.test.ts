import { describe, expect, it } from "vitest";

import type { ToolContext } from "../src/lib/context";
import { TOOLS } from "../src/tools";

const updateDocument = TOOLS.find((t) => t.name === "update_document")!;

const before = {
  id: "post-1",
  slug: "q3-board-report",
  title: "q3-board-report",
  visibility: "workspace",
  isPublished: true,
  updatedAt: "2026-10-27T00:00:00.000Z",
  workspaceId: "ws-1",
  url: "/northwind-review/q3-board-report",
  versionNumber: 1,
  tags: ["board", "q3"],
};

// The API: the post as it was, then what /update answers.
function fakeContext(update: Record<string, unknown>): ToolContext {
  return {
    webUrl: "https://opendocs.cc",
    resolveDocument: async (ref: string) => ({ ref }),
    docQuery: () => ({}),
    api: {
      get: async (path: string) => (path.endsWith("/raw") ? { markdown: "# Q3 Board Report\n" } : { post: before }),
      post: async () => ({ postId: "post-1", slug: "q3-board-report", url: before.url, ...update }),
    },
  } as unknown as ToolContext;
}

async function run(args: Record<string, unknown>, update: Record<string, unknown>) {
  const result = await updateDocument.run(updateDocument.input.parse({ document: "post-1", ...args }), fakeContext(update));
  return { text: (result.content[0] as { text: string }).text, data: result.structuredContent };
}

describe("update_document with the same content", () => {
  it("says the title changed", async () => {
    const { text, data } = await run(
      { title: "Q3 Board Report" },
      { title: "Q3 Board Report", versionNumber: 1, unchanged: true, tags: before.tags },
    );
    expect(text).toMatch(/^Changed the title of "Q3 Board Report"\. The content is the same, so it's still version 1/);
    expect(data).toMatchObject({ newVersion: false, unchanged: false, titleChanged: true });
  });

  it("says the tags changed", async () => {
    const { text, data } = await run(
      { tags: ["board"] },
      { title: before.title, versionNumber: 1, unchanged: true, tags: ["board"] },
    );
    expect(text).toMatch(/^Changed the tags of "q3-board-report"/);
    expect(data).toMatchObject({ unchanged: false, tagsChanged: true });
  });

  it("says nothing changed when nothing did", async () => {
    const { text, data } = await run(
      { title: "q3-board-report", tags: ["q3", "board"] },
      { title: before.title, versionNumber: 1, unchanged: true, tags: ["board", "q3"] },
    );
    expect(text).toMatch(/^Nothing changed in "q3-board-report"/);
    expect(data).toMatchObject({ newVersion: false, unchanged: true });
  });
});

describe("update_document with new content", () => {
  it("reports the new version", async () => {
    const { text, data } = await run(
      { markdown: "# Q3 Board Report\n\nNew.\n" },
      { title: before.title, versionNumber: 2, tags: before.tags },
    );
    expect(text).toMatch(/^Updated "q3-board-report" to version 2/);
    expect(data).toMatchObject({ newVersion: true, unchanged: false });
  });
});
