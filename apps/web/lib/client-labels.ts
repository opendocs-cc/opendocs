// Friendly names for X-OpenDocs-Client values (the agent that published a
// version). Unknown agents show their raw name; plain CLI/web publishes
// show nothing.
const CLIENT_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "opencode",
  openclaw: "OpenClaw",
  copilot: "Copilot",
  aider: "Aider",
  cline: "Cline",
  // MCP clients (mcp.opendocs.cc sends "<client>/mcp")
  "claude-ai": "Claude",
  chatgpt: "ChatGPT",
  vscode: "VS Code",
  windsurf: "Windsurf",
  zed: "Zed",
  raycast: "Raycast",
  mcp: "an MCP app",
  // The browser extension sends "opendocs-extension/<chat site>".
  "opendocs-extension": "the OpenDocs extension",
};

export function clientLabel(client: string | null | undefined): string | null {
  if (!client) return null;
  const harness = client.split("/")[0];
  if (harness === "opendocs-cli" || harness === "web" || harness === "cli") return null;
  return CLIENT_LABELS[harness] ?? harness;
}
