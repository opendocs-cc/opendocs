/**
 * Per-agent copy for the /integrations/<slug> pages. The pages share one
 * layout (components/marketing/integration-page.tsx); only this copy and
 * the example request differ.
 */
export type Integration = {
  slug: string;
  name: string;
  /** Slug in lib/agent-logos.ts, when Simple Icons has a mark for it. */
  logoSlug?: string;
  /** The /mcp tab with this agent's MCP setup, when it has one. */
  mcpTab?: string;
  metaDescription: string;
  intro: string;
  /** What the person asks the agent in the example. */
  request: string;
  /** The publish command the agent runs in the example. */
  command: string;
  /** Path after opendocs.cc/ in the example result. */
  resultPath: string;
  /** Where the CLI runs alongside this agent. */
  whereItRuns: string;
  askTitle: string;
  askDescription: string;
  ctaTitle: string;
  ctaText: string;
};

export const INTEGRATIONS: readonly Integration[] = [
  {
    slug: "claude-code",
    name: "Claude Code",
    mcpTab: "claude-code",
    logoSlug: "claude",
    metaDescription:
      "Claude Code generates specs, docs, and architecture files as Markdown. With OpenDocs, turn any .md file into a shareable link or a branded PDF in seconds.",
    intro:
      "Claude Code writes specs, docs and architecture notes as Markdown. OpenDocs turns them into shareable links and branded PDFs without leaving your terminal.",
    request: "Write an architecture doc for our new auth system and publish it to OpenDocs.",
    command: "opendocs publish auth-architecture.md --project Platform",
    resultPath: "yourteam/projects/platform/auth-architecture",
    whereItRuns: "Works on macOS, Linux and Windows.",
    askTitle: "Ask Claude to publish",
    askDescription:
      "Tell Claude Code to write a doc and publish it. It runs the command and gives you the link.",
    ctaTitle: "Claude writes it. OpenDocs ships it.",
    ctaText:
      "Every Markdown file Claude Code creates is one command away from a shareable link or a branded PDF.",
  },
  {
    slug: "codex",
    name: "Codex",
    mcpTab: "codex",
    metaDescription:
      "Codex can generate documentation as Markdown and run publishing commands. OpenDocs turns those .md files into shareable links and branded PDFs.",
    intro:
      "Codex works across your project, writes documentation as Markdown and can run the command that publishes it. OpenDocs turns those files into shareable links and branded PDFs.",
    request: "Document the database schema and publish it so the team can review.",
    command: "opendocs publish db-schema-docs.md --project Platform",
    resultPath: "yourteam/projects/platform/db-schema-docs",
    whereItRuns: "Install it alongside Codex; both live in your terminal.",
    askTitle: "Ask Codex to publish",
    askDescription:
      "Tell Codex to write docs and publish them. It runs the command, you get a link.",
    ctaTitle: "Codex writes it. OpenDocs ships it.",
    ctaText:
      "Every Markdown file Codex generates is one command away from a readable link your team can open.",
  },
  {
    slug: "cursor",
    name: "Cursor",
    mcpTab: "cursor",
    logoSlug: "cursor",
    metaDescription:
      "Cursor's agent mode generates documentation, specs, and notes as Markdown. OpenDocs turns those .md files into clean, shareable URLs and branded PDFs.",
    intro:
      "Cursor's agent mode writes documentation, specs and notes as Markdown. OpenDocs publishes them as clean, shareable links right from the integrated terminal.",
    request: "Write an API reference for the checkout endpoints and publish it to OpenDocs.",
    command: "opendocs publish checkout-api-reference.md --project API",
    resultPath: "yourteam/projects/api/checkout-api-reference",
    whereItRuns: "It runs in Cursor's integrated terminal.",
    askTitle: "Ask Cursor to publish",
    askDescription:
      "Use agent mode to write a doc and publish it. Cursor runs the command for you.",
    ctaTitle: "Cursor writes it. OpenDocs ships it.",
    ctaText:
      "Publish any Markdown file Cursor creates without leaving your editor. One command, one link.",
  },
  {
    slug: "copilot",
    name: "GitHub Copilot",
    mcpTab: "vscode",
    logoSlug: "githubcopilot",
    metaDescription:
      "GitHub Copilot's agent mode can write documentation and run terminal commands. OpenDocs lets it publish any .md file to a shareable URL or branded PDF.",
    intro:
      "GitHub Copilot's agent mode can write documentation and run terminal commands. OpenDocs lets it publish any Markdown file to a shareable link, right from your editor.",
    request: "Write a runbook for the deployment pipeline and publish it to OpenDocs.",
    command: "opendocs publish deployment-runbook.md --project Ops",
    resultPath: "yourteam/projects/ops/deployment-runbook",
    whereItRuns: "It works in VS Code's integrated terminal alongside Copilot.",
    askTitle: "Ask Copilot to publish",
    askDescription:
      "Use agent mode to write a doc and publish it. Copilot handles the terminal, you get a link.",
    ctaTitle: "Copilot writes it. OpenDocs ships it.",
    ctaText: "Publish Markdown from Copilot agent mode without leaving VS Code.",
  },
  {
    slug: "cline",
    name: "Cline",
    logoSlug: "cline",
    metaDescription:
      "Cline creates and edits files autonomously in VS Code, including Markdown docs. OpenDocs gives those .md files a shareable URL in seconds.",
    intro:
      "Cline creates and edits files in VS Code, including Markdown docs, specs and notes. OpenDocs gives those files a shareable link in seconds.",
    request: "Write a migration guide for the v2 API and publish it so the team can review.",
    command: "opendocs publish v2-migration-guide.md --project API",
    resultPath: "yourteam/projects/api/v2-migration-guide",
    whereItRuns: "Cline can run it from the VS Code terminal.",
    askTitle: "Ask Cline to publish",
    askDescription:
      "Tell Cline to write and publish. It runs the command in the terminal; you approve, it ships.",
    ctaTitle: "Cline writes it. OpenDocs ships it.",
    ctaText: "Every doc Cline generates is one approval away from a shareable link.",
  },
  {
    slug: "aider",
    name: "Aider",
    metaDescription:
      "Aider is a terminal-first AI pair programmer that creates Markdown docs. OpenDocs turns those .md files into shareable URLs instantly.",
    intro:
      "Aider is a terminal-first AI pair programmer that edits code and writes Markdown docs. OpenDocs turns those files into shareable links, with no git push or deploy.",
    request: "Write a changelog for the latest release and publish it to OpenDocs.",
    command: "opendocs publish changelog-v2.md --project Releases",
    resultPath: "yourteam/projects/releases/changelog-v2",
    whereItRuns: "Both tools live in your terminal, side by side.",
    askTitle: "Publish from Aider",
    askDescription:
      "After Aider writes a doc, publish it with /run or from a second terminal tab.",
    ctaTitle: "Aider writes it. OpenDocs ships it.",
    ctaText:
      "Keep your git-native workflow and publish any Markdown file Aider creates to a readable link.",
  },
  {
    slug: "openclaw",
    name: "OpenClaw",
    metaDescription:
      "OpenClaw generates Markdown docs as part of your coding workflow. With OpenDocs, every .md file is one command away from a clean, shareable URL.",
    intro:
      "Your OpenClaw agent writes Markdown as part of your coding workflow. With OpenDocs, every file is one command away from a clean link your team can read.",
    request: "Draft a technical spec for the payments API and publish it to OpenDocs.",
    command: "opendocs publish payments-api-spec.md --project Payments",
    resultPath: "yourteam/projects/payments/payments-api-spec",
    whereItRuns: "It's the bridge between your agent and the web.",
    askTitle: "Tell OpenClaw to publish",
    askDescription: "Ask your agent to write any doc and publish it. You get the link back.",
    ctaTitle: "Your agent writes it. OpenDocs ships it.",
    ctaText:
      "Stop copying Markdown into wikis. Tell OpenClaw to publish and share the link.",
  },
  {
    slug: "hermes-agent",
    name: "Hermes Agent",
    metaDescription:
      "Hermes Agent can run across your server, terminal, and messaging platforms. OpenDocs gives the Markdown it creates a stable URL your team can read and update.",
    intro:
      "Hermes Agent runs across your server, terminal and messaging apps and remembers project context. OpenDocs gives the Markdown it writes a stable link your team can read and it can update.",
    request: "Write this week's engineering brief and publish it to OpenDocs.",
    command: "opendocs publish engineering-brief.md --project Briefs --json",
    resultPath: "yourteam/projects/briefs/engineering-brief",
    whereItRuns: "Install it wherever Hermes runs commands: a server, container or terminal.",
    askTitle: "Ask Hermes to publish",
    askDescription:
      "Hermes can draft the doc, publish it, remember it, and update the same link next week.",
    ctaTitle: "Hermes remembers it. OpenDocs publishes it.",
    ctaText:
      "Give long-running agents a clean publishing target with a link your team keeps.",
  },
] as const;

export function getIntegration(slug: string) {
  const integration = INTEGRATIONS.find((item) => item.slug === slug);
  if (!integration) throw new Error(`Unknown integration: ${slug}`);
  return integration;
}
