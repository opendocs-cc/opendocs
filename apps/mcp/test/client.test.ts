import { describe, expect, it } from "vitest";

import { identifyClient } from "../src/lib/client";

describe("identifyClient", () => {
  it("names CIMD clients by host", () => {
    expect(identifyClient("https://claude.ai/oauth/mcp-oauth-client-metadata", null).header).toBe("claude-ai/mcp");
    expect(identifyClient("https://chatgpt.com/oauth/client.json", null).name).toBe("ChatGPT");
    expect(identifyClient("https://vscode.dev/oauth/client-metadata.json", null).slug).toBe("vscode");
  });

  it("falls back to the user agent, then to a generic name", () => {
    expect(identifyClient("abc123", "claude-code/2.1.300 (cli)").header).toBe("claude-code/mcp");
    expect(identifyClient("abc123", "Cursor/1.9").slug).toBe("cursor");
    expect(identifyClient("abc123", null)).toEqual({ slug: "mcp", name: "this app", header: "mcp" });
  });
});
