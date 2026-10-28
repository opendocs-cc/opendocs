/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
// Page paths are linked from the product, the CLI and skill.md, so pages stay
// where they are; the sidebar groups them by what people are trying to do.
const doc = (id, label) => ({ type: "doc", id, label });

const sidebars = {
  docsSidebar: [
    {
      type: "category",
      label: "Start here",
      collapsible: false,
      items: [
        doc("index", "Overview"),
        doc("getting-started/quickstart", "Quickstart"),
        doc("getting-started/what-to-ask", "What to ask your agent"),
        doc("getting-started/how-opendocs-works", "How OpenDocs works"),
        doc("getting-started/plans-and-limits", "Plans and limits"),
      ],
    },
    {
      type: "category",
      label: "Your agent",
      items: [
        doc("integrations/overview", "Set up your agent"),
        doc("integrations/mcp", "MCP server (Claude, ChatGPT)"),
        doc("integrations/browser-extension", "Browser extension"),
        doc("integrations/claude-code", "Claude Code"),
        doc("integrations/codex", "Codex"),
        doc("integrations/cursor", "Cursor"),
        doc("integrations/copilot", "GitHub Copilot"),
        doc("integrations/cline", "Cline"),
        doc("integrations/aider", "Aider"),
        doc("integrations/openclaw", "OpenClaw"),
        doc("integrations/hermes-agent", "Hermes Agent"),
        doc("getting-started/skill-md", "The OpenDocs skill"),
        doc("getting-started/agent-quickstart", "Agent quickstart"),
        doc("agents/cookbook", "Agent cookbook"),
      ],
    },
    {
      type: "category",
      label: "Documents",
      items: [
        doc("publishing/publish", "Publish"),
        doc("publishing/projects", "Projects"),
        doc("publishing/update-and-version-history", "Updates and versions"),
        doc("publishing/sync-and-history", "Sync a folder"),
        doc("publishing/list-get-pull-unpublish", "Find, download and remove"),
        doc("publishing/branded-exports", "PDF, Word and branding"),
        doc("publishing/rendering-and-metadata", "Markdown that renders"),
      ],
    },
    {
      type: "category",
      label: "Sharing and teams",
      items: [
        doc("visibility/overview", "Who can see a document"),
        doc("visibility/sharing-and-anonymous-links", "Share with people"),
        doc("visibility/public-sharing", "Public documents"),
        doc("publishing/custom-domains", "Custom domains"),
        doc("visibility/workspaces-and-team-access", "Workspaces and teams"),
      ],
    },
    {
      type: "category",
      label: "Integrations",
      items: [
        doc("integrations/google-drive", "Google Drive"),
        doc("integrations/docuseal", "E-signatures (DocuSeal)"),
      ],
    },
    {
      type: "category",
      label: "Reference",
      items: [
        doc("cli/reference", "CLI reference"),
        doc("reference/mcp-tools", "MCP tools"),
        doc("getting-started/cli-quickstart", "Use the CLI yourself"),
        doc("errors", "Errors"),
        doc("getting-started/troubleshooting", "Troubleshooting"),
        {
          type: "category",
          label: "REST API",
          items: [
            doc("api-reference/authentication", "Authentication"),
            doc("api-reference/agent-endpoints", "Agent endpoints"),
            doc("api-reference/api-keys", "API keys"),
            doc("api-reference/me", "Me and quota"),
            doc("api-reference/onboarding-and-profile", "Onboarding and profile"),
            doc("api-reference/publish", "Publish"),
            doc("api-reference/posts", "Posts"),
            doc("api-reference/post-mutations", "Post changes"),
            doc("api-reference/projects", "Projects"),
            doc("api-reference/exports", "Exports"),
            doc("api-reference/integrations", "Integrations"),
            doc("api-reference/workspaces", "Workspaces"),
            doc("api-reference/team-and-invitations", "Team and invitations"),
            doc("api-reference/usernames", "Usernames"),
            doc("api-reference/account", "Account"),
            doc("api-reference/openapi", "OpenAPI spec"),
            doc("api-reference/errors-and-pagination", "Errors and pagination"),
          ],
        },
      ],
    },
  ],
};

module.exports = sidebars;
