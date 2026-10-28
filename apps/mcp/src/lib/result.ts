import type { CallToolResult } from "@modelcontextprotocol/server";

/**
 * Tool results: a short Markdown summary for the model to relay (links on
 * their own lines, who can open a document), plus the same facts as
 * structured content. Some clients (Claude Code among them) show the model
 * only the structured content when there is any, so it must carry every
 * fact and next step the text does, a document's Markdown included.
 */
export function ok(text: string, structured?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

/**
 * A failure the model should explain to the user, with what to do next.
 * The message goes into the structured content too, for the same clients.
 */
export function fail(text: string, structured?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text }],
    isError: true,
    structuredContent: { ...structured, message: text },
  };
}

export const VISIBILITY_TEXT: Record<string, string> = {
  private: "Only you can open it.",
  workspace: "Members of the workspace can open it.",
  restricted_email: "Only the people it's shared with can open it.",
  public: "Anyone with the link can open it.",
};

export function visibilityText(visibility: string | null | undefined): string {
  return VISIBILITY_TEXT[visibility ?? ""] ?? "";
}

export function docLink(post: { publicUrl?: string | null; url?: string | null }, webUrl: string): string {
  if (post.publicUrl) return post.publicUrl;
  if (!post.url) return "";
  return /^https?:\/\//.test(post.url) ? post.url : `${webUrl}${post.url.startsWith("/") ? "" : "/"}${post.url}`;
}
