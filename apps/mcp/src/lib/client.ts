/**
 * Which app is calling, for version history ("Published from Claude") and
 * for wording in tool results. Clients that registered with a Client ID
 * Metadata Document are identified by its host; others by user agent.
 */
const BY_HOST: Array<[RegExp, string, string]> = [
  [/(^|\.)claude\.(ai|com)$/, "claude-ai", "Claude"],
  [/(^|\.)anthropic\.com$/, "claude-ai", "Claude"],
  [/(^|\.)chatgpt\.com$/, "chatgpt", "ChatGPT"],
  [/(^|\.)openai\.com$/, "chatgpt", "ChatGPT"],
  [/(^|\.)vscode\.dev$/, "vscode", "VS Code"],
  [/(^|\.)cursor\.(com|sh)$/, "cursor", "Cursor"],
];

const BY_USER_AGENT: Array<[RegExp, string, string]> = [
  [/claude-code/i, "claude-code", "Claude Code"],
  [/claude/i, "claude-ai", "Claude"],
  [/chatgpt|openai/i, "chatgpt", "ChatGPT"],
  [/codex/i, "codex", "Codex"],
  [/cursor/i, "cursor", "Cursor"],
  [/windsurf|devin/i, "windsurf", "Windsurf"],
  [/visual studio code|vscode/i, "vscode", "VS Code"],
  [/zed/i, "zed", "Zed"],
  [/raycast/i, "raycast", "Raycast"],
  [/gemini|antigravity/i, "gemini", "Antigravity"],
];

export type ClientIdentity = { slug: string; name: string; header: string };

export function identifyClient(clientId: string, userAgent: string | null): ClientIdentity {
  let host: string | null = null;
  if (/^https:\/\//i.test(clientId)) {
    try {
      host = new URL(clientId).hostname.toLowerCase();
    } catch {
      host = null;
    }
  }
  const match =
    (host && BY_HOST.find(([re]) => re.test(host!))) ||
    (userAgent && BY_USER_AGENT.find(([re]) => re.test(userAgent))) ||
    null;
  if (!match) return { slug: "mcp", name: "this app", header: "mcp" };
  return { slug: match[1], name: match[2], header: `${match[1]}/mcp` };
}
