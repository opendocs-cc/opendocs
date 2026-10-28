import type { MetadataRoute } from "next";
import { instanceWebUrl, isSelfHosted } from "@opendocs/shared/config/instance";

// OpenDocs' own pages only. Workspace pages aren't listed; if they ever
// are, leave out workspaces with an active custom domain: their pages live
// on that domain, which serves its own /sitemap.xml
// (app/%5Fopendocs/sitemap.xml), and a sitemap may only list its own host.
export default function sitemap(): MetadataRoute.Sitemap {
  // A self-hosted instance has none of these pages (and robots.txt says so).
  if (isSelfHosted()) return [];
  const base = instanceWebUrl();

  const integrations = [
    "claude-code",
    "cursor",
    "copilot",
    "cline",
    "aider",
    "hermes-agent",
    "codex",
    "openclaw",
  ];

  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/faq`, changeFrequency: "monthly", priority: 0.7 },
    // Connecting Claude, ChatGPT and other apps over MCP.
    { url: `${base}/mcp`, changeFrequency: "monthly", priority: 0.8 },
    // Free converter and tool pages — high priority: they're how most
    // people find OpenDocs from search ("markdown to pdf", "markdown to
    // docx", "publish markdown online", etc.). They link to each other,
    // so they should be crawled together.
    {
      url: `${base}/tools/markdown-to-pdf`,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    {
      url: `${base}/tools/markdown-to-word`,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    {
      url: `${base}/tools/markdown-to-docx`,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    },
    {
      url: `${base}/tools/publish-markdown-online`,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    // The paste-in tools (publish-markdown-online above is one too): each
    // targets a specific search ("chatgpt to pdf", "readme to pdf",
    // "markdown table to word").
    {
      url: `${base}/tools/chatgpt-to-pdf`,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    {
      url: `${base}/tools/readme-to-pdf`,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    },
    {
      url: `${base}/tools/markdown-table-to-word`,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    },
    {
      url: `${base}/tools/share-markdown-document`,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    },
    {
      url: `${base}/tools/claude-code-publish-markdown`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      url: `${base}/tools/cursor-publish-markdown`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      url: `${base}/tools/ai-agent-markdown-to-pdf`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    // Use-case pages — for searches about the workflow ("publish
    // markdown from AI agents") rather than the format ("markdown to
    // pdf"). Slightly lower priority than the tool pages but still
    // indexed weekly.
    {
      url: `${base}/use-cases/ai-agent-docs`,
      changeFrequency: "monthly" as const,
      priority: 0.85,
    },
    {
      url: `${base}/use-cases/client-reports`,
      changeFrequency: "monthly" as const,
      priority: 0.85,
    },
    {
      url: `${base}/use-cases/internal-docs`,
      changeFrequency: "monthly" as const,
      priority: 0.85,
    },
    // Comparison pages ("opendocs vs notion") — moderate priority.
    {
      url: `${base}/compare/opendocs-vs-notion`,
      changeFrequency: "monthly" as const,
      priority: 0.75,
    },
    {
      url: `${base}/compare/opendocs-vs-github-gist`,
      changeFrequency: "monthly" as const,
      priority: 0.75,
    },
    {
      url: `${base}/compare/opendocs-vs-gitbook`,
      changeFrequency: "monthly" as const,
      priority: 0.75,
    },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/refund-policy`, changeFrequency: "yearly", priority: 0.3 },
    ...integrations.map((slug) => ({
      url: `${base}/integrations/${slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
