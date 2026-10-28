/**
 * Agent discovery files: how an agent finds OpenDocs' capabilities, API,
 * docs, pricing and skill without scraping the homepage. Served from
 * /.well-known/agent.json (plus /agent.json and /.well-known/agent),
 * /.well-known/agent-card.json, /.well-known/ai-plugin.json,
 * /.well-known/api-catalog, /pricing.md, /schema-map.xml and
 * /schema-feeds/agent-resources.jsonl, and listed in /robots.txt and
 * /llms.txt.
 *
 * They describe public surfaces that exist today only: OpenDocs has a REST
 * API with API keys, an agent skill, and a remote MCP server at
 * https://mcp.opendocs.cc/mcp that signs people in with OAuth 2.1 (issuer
 * https://opendocs.cc/api/auth). OAuth tokens are for the MCP server; the
 * REST API is called with API keys. There's no A2A endpoint. The setup
 * prompt, plan limits, prices and MCP URLs come from the same modules the
 * site uses, so they can't drift.
 */
import { PLAN_LIMITS } from "@opendocs/shared/billing/plan-limits";
import { OFFICIAL_DOCS_URL, instanceApiUrl, instanceWebUrl } from "@opendocs/shared/config/instance";

import { AGENT_SETUP_PROMPT } from "./agent-prompt";
import {
  CLAUDE_CODE_ADD_COMMAND,
  MCP_DOCS_URL,
  MCP_PAGE_URL,
  MCP_SERVER_URL,
  MCP_TOOLS_DOCS_URL,
  OAUTH_AUTHORIZATION_SERVER_METADATA_URL,
  OAUTH_ISSUER,
  OAUTH_PROTECTED_RESOURCE_METADATA_URL,
} from "./mcp";
import { PLAN_PRICES, perMonth } from "./plan-prices";

// This instance (opendocs.cc, or a self-hosted one); the docs are always
// docs.opendocs.cc.
const SITE = instanceWebUrl();
const API = instanceApiUrl();
const DOCS = OFFICIAL_DOCS_URL;

const NAME = "OpenDocs";
const TAGLINE = "Publishing for AI agents: Markdown to shareable links and branded PDF and Word files.";
const SUMMARY =
  "OpenDocs turns the Markdown an agent writes into organized, shareable links with version history, and exports branded PDF and Word files from the same source.";

const OPENAPI_TYPE = "application/vnd.oai.openapi+json;version=3.1";

export const DISCOVERY_URLS = {
  homepage: SITE,
  docs: DOCS,
  openapi: `${SITE}/openapi.json`,
  llms: `${SITE}/llms.txt`,
  docsLlms: `${DOCS}/llms.txt`,
  llmsFull: `${DOCS}/llms-full.txt`,
  agentGuide: `${SITE}/docs`,
  agentQuickstart: `${DOCS}/getting-started/agent-quickstart.md`,
  pricing: `${SITE}/pricing.md`,
  pricingPage: `${SITE}/pricing`,
  skill: `${SITE}/skill.md`,
  wellKnownSkills: `${SITE}/.well-known/agent-skills/index.json`,
  skillRepository: "https://github.com/opendocs-cc/opendocs-cli",
  skillSource: "https://github.com/opendocs-cc/opendocs-cli/blob/main/agent/SKILL.md",
  installScript: `${SITE}/install.sh`,
  agentJson: `${SITE}/.well-known/agent.json`,
  agentJsonAlias: `${SITE}/agent.json`,
  wellKnownAgentAlias: `${SITE}/.well-known/agent`,
  agentCard: `${SITE}/.well-known/agent-card.json`,
  aiPlugin: `${SITE}/.well-known/ai-plugin.json`,
  apiCatalog: `${SITE}/.well-known/api-catalog`,
  schemaMap: `${SITE}/schema-map.xml`,
  schemaFeed: `${SITE}/schema-feeds/agent-resources.jsonl`,
  apiBase: API,
  apiHealth: `${API}/healthz`,
  apiDocs: `${DOCS}/api-reference/authentication`,
  mcpServer: MCP_SERVER_URL,
  mcpSetup: MCP_PAGE_URL,
  mcpDocs: MCP_DOCS_URL,
  mcpTools: MCP_TOOLS_DOCS_URL,
  oauthIssuer: OAUTH_ISSUER,
  oauthAuthorizationServer: OAUTH_AUTHORIZATION_SERVER_METADATA_URL,
  oauthProtectedResource: OAUTH_PROTECTED_RESOURCE_METADATA_URL,
  terms: `${SITE}/terms`,
  privacy: `${SITE}/privacy`,
  logo: `${SITE}/opendocs-icon.svg`,
} as const;

const SUPPORT_EMAIL = "hello@opendocs.cc";
const U = DISCOVERY_URLS;

const MCP_NOTE = `Remote MCP server (Streamable HTTP) at ${MCP_SERVER_URL} for Claude, ChatGPT, Claude Code, Codex, Cursor, VS Code and other MCP clients. People sign in with their OpenDocs account over OAuth 2.1 and choose permissions on a consent screen. Works on every plan. Setup: ${MCP_PAGE_URL}. With a shell, the skill and CLI are better for local files, folders and images.`;
const OAUTH_NOTE = `OAuth 2.1 signs people in to the MCP server; the client discovers the authorization server from the protected resource metadata. Tokens are issued for the resource ${MCP_SERVER_URL}. The REST API itself uses API keys (Bearer od_live_...). People revoke connected apps in Dashboard → Connected apps.`;
const NO_A2A = "The agent card describes OpenDocs' capabilities for discovery; there's no A2A RPC endpoint.";

/** /.well-known/agent.json (and its /agent.json and /.well-known/agent aliases). */
export function agentManifest() {
  return {
    schema_version: "1.0",
    name: NAME,
    description: TAGLINE,
    url: SITE,
    provider: { name: NAME, url: SITE },
    capabilities: [
      "Publish Markdown files or whole folders to stable links at opendocs.cc/{workspace}/{slug}, private to the workspace by default.",
      "Publish without an account: a link anyone can open for 24 hours, plus a claim link to keep it.",
      "Update a document by publishing the same file again: same URL, a new version, with conflict protection against overwriting a newer one.",
      "Keep every version with who published it and through which agent; read old versions and roll back.",
      "Organize documents into projects, like branches in a repo, at opendocs.cc/{workspace}/projects/{project}/{slug}.",
      "Control access: private, workspace members, shared with specific email addresses or email domains, or public.",
      "Export PDF and Word (.docx) files typeset from the same Markdown, with a workspace export theme: presets, brand color, font, logo and footer.",
      "Run teams: workspaces, email invitations, owner/admin/member roles, domain auto-join.",
      "Sync a local folder with a workspace: clone, status and publish, with local images uploaded automatically.",
      "Save documents to named Google Drive folders and send them for e-signature through DocuSeal (Pro and Team).",
      "Connect from Claude, ChatGPT, Cursor, VS Code and other MCP clients through the remote MCP server, signing in with an OpenDocs account (OAuth).",
    ],
    use_cases: [
      "Turn a report, spec, proposal or notes an agent wrote into a link the team can open.",
      "Publish a document and hand the person a branded PDF or Word file in the same step.",
      "Re-export a folder of long documents after a round of edits.",
      "Share one document with a client or contractor without adding them to the workspace.",
      "Keep a project's documents together and roll one back to yesterday's version.",
      "Apply a company's brand to every export.",
      "File a signed agreement in Google Drive after DocuSeal collects the signatures.",
    ],
    onboarding: {
      setup_prompt: AGENT_SETUP_PROMPT,
      agent_quickstart: U.agentQuickstart,
      notes: [
        "People start by pasting the setup prompt into their agent. The agent installs the skill, signs them up or in with an emailed 6-digit code, then reads the agent quickstart.",
        `Free accounts can publish ${PLAN_LIMITS.free.documentsPerWorkspace} documents per workspace.`,
        `In Claude, ChatGPT and other MCP apps, people add the MCP server (${MCP_SERVER_URL}) instead and sign in with OAuth. Setup for each app: ${MCP_PAGE_URL}.`,
      ],
    },
    auth: {
      type: "bearer_api_key",
      header: "Authorization: Bearer od_live_<key>",
      anonymousPublishing: true,
      apiKeyFlow: {
        requestCode: `POST ${API}/api/v1/auth/code/request`,
        verifyCode: `POST ${API}/api/v1/auth/code/verify`,
      },
      notes: [
        "Verifying the emailed code creates the account if the email is new and returns an API key; the CLI does this with opendocs login --email.",
        "Listing, creating and revoking API keys is done in the dashboard (a signed-in browser session), not with an API key.",
        "Anonymous publishing (POST /api/v1/anonymous/publish) needs no key and expires after 24 hours.",
        "Send X-OpenDocs-Client: <agent> so version history shows which agent published.",
      ],
      mcpOAuth: {
        resource: MCP_SERVER_URL,
        issuer: OAUTH_ISSUER,
        authorizationServerMetadata: OAUTH_AUTHORIZATION_SERVER_METADATA_URL,
        protectedResourceMetadata: OAUTH_PROTECTED_RESOURCE_METADATA_URL,
        notes: [
          "MCP clients find the authorization server through the protected resource metadata and run the OAuth flow from there; nothing needs to be configured by hand.",
          "People sign in with their OpenDocs account (emailed code, Google or GitHub) and approve the app's permissions on a consent screen.",
          "Access tokens are for the MCP server only. Use an API key for direct REST API calls.",
        ],
      },
    },
    protocols: {
      openapi: { supported: true, url: U.openapi },
      mcp: {
        supported: true,
        url: MCP_SERVER_URL,
        transport: "streamable-http",
        setup_url: MCP_PAGE_URL,
        docs_url: MCP_DOCS_URL,
        tools_url: MCP_TOOLS_DOCS_URL,
        claude_code_command: CLAUDE_CODE_ADD_COMMAND,
        note: MCP_NOTE,
      },
      oauth: {
        supported: true,
        issuer: OAUTH_ISSUER,
        authorization_server_metadata: OAUTH_AUTHORIZATION_SERVER_METADATA_URL,
        protected_resource_metadata: OAUTH_PROTECTED_RESOURCE_METADATA_URL,
        resource: MCP_SERVER_URL,
        note: OAUTH_NOTE,
      },
      a2aRpc: { supported: false, note: NO_A2A },
    },
    api: { base_url: API, openapi_url: U.openapi, docs_url: U.apiDocs },
    agent_resources: {
      llms_txt: U.llms,
      docs_llms_txt: U.docsLlms,
      llms_full_txt: U.llmsFull,
      agent_guide_markdown: U.agentGuide,
      agent_quickstart: U.agentQuickstart,
      mcp_setup: U.mcpSetup,
      mcp_docs: U.mcpDocs,
      pricing_markdown: U.pricing,
      agent_json: U.agentJson,
      agent_json_alias: U.agentJsonAlias,
      well_known_agent_alias: U.wellKnownAgentAlias,
      schema_map: U.schemaMap,
      schema_feed: U.schemaFeed,
      markdown_pages: "Every docs page is also served as Markdown: add .md to a docs.opendocs.cc URL.",
    },
    skill: {
      url: U.skill,
      repository_url: U.skillRepository,
      source_url: U.skillSource,
      well_known_skills_url: U.wellKnownSkills,
      install_commands: {
        skills: "npx skills add opendocs-cc/skills --skill opendocs -g -y",
        fallback: `curl -fsSL ${U.installScript} | bash`,
        cli: "npm install -g @opendocs.cc/cli",
        from_cli: "opendocs agent --install",
      },
    },
    support: { email: SUPPORT_EMAIL },
    links: {
      homepage: U.homepage,
      docs: U.docs,
      mcpServer: U.mcpServer,
      mcpSetup: U.mcpSetup,
      openapi: U.openapi,
      llms: U.llms,
      llmsFull: U.llmsFull,
      pricing: U.pricing,
      skill: U.skill,
      wellKnownSkills: U.wellKnownSkills,
      skillRepository: U.skillRepository,
      apiCatalog: U.apiCatalog,
      agentJson: U.agentJson,
      agentJsonAlias: U.agentJsonAlias,
      wellKnownAgentAlias: U.wellKnownAgentAlias,
      agentCard: U.agentCard,
      aiPlugin: U.aiPlugin,
      schemaMap: U.schemaMap,
      schemaFeed: U.schemaFeed,
    },
  };
}

/** /.well-known/agent-card.json, an A2A-style agent card for discovery. */
export function agentCard() {
  return {
    protocolVersion: "0.3.0",
    name: NAME,
    description: SUMMARY,
    url: SITE,
    provider: { organization: NAME, url: SITE },
    version: "1.0.0",
    documentationUrl: DOCS,
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    securitySchemes: {
      bearerApiKey: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "API key",
        description: "Authorization: Bearer od_live_<key> for authenticated API calls.",
      },
    },
    security: [{ bearerApiKey: [] }],
    defaultInputModes: ["text/markdown", "application/json", "text/plain"],
    defaultOutputModes: [
      "application/json",
      "text/markdown",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    skills: [
      {
        id: "publish_markdown",
        name: "Publish Markdown",
        description:
          "Publish Markdown files or folders to stable, shareable links, update them in place and keep every version.",
        tags: ["publishing", "markdown", "documents", "versions", "agents"],
        examples: [
          "Publish the launch plan",
          "Publish everything in the docs folder",
          "I edited the handbook, update it",
        ],
      },
      {
        id: "export_documents",
        name: "Export PDF and Word",
        description:
          "Export typeset PDF and Word files from the same Markdown, with the workspace's export theme: presets, brand color, font, logo and footer.",
        tags: ["pdf", "docx", "export", "branding"],
        examples: [
          "Send me the board report as a PDF",
          "Publish the proposal and give me a Word file too",
          "Use the Boardroom preset with our logo",
        ],
      },
      {
        id: "organize_and_share",
        name: "Organize and share",
        description:
          "File documents into projects, control who can see them (private, workspace, shared with people or domains, public), invite teammates and roll back versions.",
        tags: ["projects", "access-control", "sharing", "teams", "rollback"],
        examples: [
          "Put this in the Product project",
          "Share the onboarding handbook with dana@halvard.example",
          "Roll the pricing spec back to yesterday",
        ],
      },
      {
        id: "drive_and_signatures",
        name: "Google Drive and e-signatures",
        description:
          "Save documents to named Google Drive folders and send them for signing through DocuSeal, with a draft the person confirms before anything is sent (Pro and Team).",
        tags: ["google-drive", "e-signatures", "docuseal", "integrations"],
        examples: [
          "Save the board minutes to the Board Minutes folder as a PDF",
          "Send the consulting agreement to Ines Duarte, ines@northwind.example, for signing",
        ],
      },
    ],
    x_opendocs: {
      note: NO_A2A,
      docsUrl: DOCS,
      openapiUrl: U.openapi,
      llmsTxtUrl: U.llms,
      aiPluginUrl: U.aiPlugin,
      apiCatalogUrl: U.apiCatalog,
      skillUrl: U.skill,
      supportsMcp: true,
      supportsOAuth: true,
      mcpUrl: U.mcpServer,
      mcpSetupUrl: U.mcpSetup,
      oauthAuthorizationServerMetadataUrl: U.oauthAuthorizationServer,
      oauthProtectedResourceMetadataUrl: U.oauthProtectedResource,
    },
  };
}

/** /.well-known/ai-plugin.json, an OpenAI-style plugin manifest. */
export function aiPluginManifest() {
  return {
    schema_version: "v1",
    name_for_human: NAME,
    name_for_model: "opendocs",
    description_for_human: "Publish Markdown from any AI agent as shareable links and branded PDF and Word files.",
    description_for_model:
      "Use OpenDocs when the user wants to publish, share, host or send a Markdown document, turn notes into a link, keep a document's versions, or get a PDF or Word version of Markdown. Documents are private to the user's workspace by default; never make one public without the user's explicit confirmation. Supports anonymous 24-hour links without an account, projects, sharing with specific people, export themes, Google Drive and DocuSeal e-signatures.",
    auth: { type: "service_http", authorization_type: "bearer", verification_tokens: {} },
    api: { type: "openapi", url: U.openapi, is_user_authenticated: true },
    logo_url: U.logo,
    contact_email: SUPPORT_EMAIL,
    legal_info_url: U.terms,
  };
}

/** /.well-known/api-catalog, an RFC 9727 linkset. */
export function apiCatalog() {
  return {
    linkset: [
      {
        anchor: API,
        item: [{ href: U.openapi, type: OPENAPI_TYPE, title: "OpenDocs OpenAPI specification" }],
        "service-desc": [{ href: U.openapi, type: OPENAPI_TYPE }],
        "service-doc": [{ href: U.apiDocs, type: "text/html", title: "OpenDocs REST API reference" }],
        status: [{ href: U.apiHealth, type: "application/json" }],
        describedby: [
          { href: U.llms, type: "text/plain", title: "Concise agent context" },
          { href: U.llmsFull, type: "text/plain", title: "Full documentation in one file" },
          { href: U.agentGuide, type: "text/markdown", title: "Agent guide" },
          { href: U.pricing, type: "text/markdown", title: "Machine-readable pricing" },
          { href: U.agentJson, type: "application/json", title: "Agent discovery manifest" },
          { href: U.agentJsonAlias, type: "application/json", title: "Agent discovery manifest root alias" },
          { href: U.wellKnownAgentAlias, type: "application/json", title: "Agent discovery manifest well-known alias" },
          { href: U.agentCard, type: "application/json", title: "Agent card" },
          { href: U.aiPlugin, type: "application/json", title: "OpenAI plugin manifest" },
          { href: U.skill, type: "text/markdown", title: "Agent skill" },
          { href: U.schemaMap, type: "application/xml", title: "Schema map" },
          { href: U.schemaFeed, type: "application/jsonl", title: "Agent resources schema feed" },
        ],
      },
    ],
  };
}

const dollars = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const count = (n: number) => (Number.isFinite(n) ? String(n) : "Unlimited");

/** /pricing.md: plans, features and limits for agents. */
export function pricingMarkdown() {
  const { pro, team } = PLAN_PRICES;
  const { free, pro: proLimits, team: teamLimits } = PLAN_LIMITS;
  return `# OpenDocs pricing

Machine-readable plans, features and limits for OpenDocs. Prices in USD.

Canonical pricing: ${U.pricingPage}
Plans and limits in the docs: ${DOCS}/getting-started/plans-and-limits

The agent workflow, the CLI and the REST API work the same on every plan. Plans differ in how many documents, workspaces and members you have, Word export, the export footer, custom domains and integrations.

These are list prices. Time-limited offers, such as the founding-member discount on Pro, are shown on the pricing page and applied at checkout.

## Anonymous

- Price: $0
- Account required: No
- Documents: Temporary links only, open to anyone with the link
- Link expiry: 24 hours, unless claimed into an account with the claim link
- Max Markdown size: 512 KB
- Publish rate limit: 20 / hour / IP (publishes and updates combined)
- Notes: For a quick throwaway link. Sign up to keep documents.

## Free

- Price: $0
- Published documents: ${count(free.documentsPerWorkspace)} per workspace (updates and unpublished documents don't count)
- Workspaces: ${count(free.workspaces)}
- Members per workspace: ${count(free.membersPerWorkspace)} (pending invitations count)
- PDF export: Yes, with a "Made with OpenDocs" footer
- Word (.docx) export: No
- Export branding (presets, brand color, font, logo): Yes
- Custom export footer: No
- Custom domain: No
- Google Drive and DocuSeal e-signatures: No
- Visibility, sharing with people and domains, public documents: Yes
- Version history and rollback: Yes
- Roles (owner, admin, member): Yes
- API keys, CLI and agent skill: Yes
- Support: Community

## Pro

- Price: ${dollars(pro.monthly)} / month, or ${dollars(pro.yearly)} / year (${dollars(perMonth(pro.yearly))} / month)
- Published documents: ${count(proLimits.documentsPerWorkspace)}
- Workspaces: ${count(proLimits.workspaces)} included; the owner can add more from Billing
- Members per workspace: ${count(proLimits.membersPerWorkspace)}
- PDF and Word (.docx) export: Yes
- Export branding: Yes
- Custom export footer (replaces "Made with OpenDocs"): Yes
- Custom domain: 1 per workspace (documents served on your own domain, such as notes.example.com)
- Google Drive and DocuSeal e-signatures: Yes
- Support: Email

## Team

- Price: ${dollars(team.monthlyPerSeat)} / member / month, or ${dollars(team.yearlyPerSeat)} / member / year (${dollars(perMonth(team.yearlyPerSeat))} / month)
- Minimum: ${team.minSeats} seats (${dollars(team.monthlyPerSeat * team.minSeats)} / month or ${dollars(team.yearlyPerSeat * team.minSeats)} / year)
- Published documents: ${count(teamLimits.documentsPerWorkspace)}
- Workspaces: ${count(teamLimits.workspaces)}
- Members: ${count(teamLimits.membersPerWorkspace)}; seats follow confirmed membership (added when an invitation is accepted, released on removal), prorated, and a person counts once across the owner's workspaces
- Billing: Only the workspace owner can buy or change Team
- Everything in Pro
- Support: Priority

## Limits on every plan

- Markdown per document: 1 MB
- Local images: 30 per document, 10 MB each (JPEG, PNG, WebP, GIF, SVG)
- Batch publish: 25 documents per request
- Batch export: 10 documents per request
- Rate limits per account, per minute: 120 publishes, 20 batch publishes, 120 exports, 30 batch exports, 4 exports running at once; 600 requests per IP across the API
- Over a limit: 429 rate_limited with Retry-After; the CLI (0.4.6+) waits and retries

## Agent guidance

- Recommend Free unless the person needs more than ${free.documentsPerWorkspace} documents, Word files, their own export footer, their own domain, more workspaces or members, Google Drive or e-signatures.
- Free exports can carry the person's brand color, font and logo; only the footer needs Pro or Team.
- Check the live quota with GET ${API}/api/v1/me or opendocs whoami --json before a large publish. On document_limit, tell the person and don't retry.
- On docx_requires_pro, offer a PDF instead.
- Use anonymous publishing only when the person agrees that anyone with the link can read it.
- Don't quote prices or plans not listed here.

## Related resources

- Pricing page: ${U.pricingPage}
- Docs: ${DOCS}
- Agent quickstart: ${U.agentQuickstart}
- API: ${U.openapi}
- Agent context: ${U.llms}
- Agent manifest: ${U.agentJson}
`;
}

const SCHEMA_MAP_ENTRIES: Array<{ loc: string; type: string; encoding: string; description: string }> = [
  {
    loc: U.schemaFeed,
    type: "JSONL",
    encoding: "application/jsonl",
    description: "Structured product, API and agent-discovery resources for OpenDocs.",
  },
  { loc: U.openapi, type: "OpenAPI", encoding: OPENAPI_TYPE, description: "OpenAPI 3.1 specification for the OpenDocs REST API." },
  {
    loc: U.agentJson,
    type: "AgentDiscovery",
    encoding: "application/json",
    description: "Agent discovery manifest describing OpenDocs capabilities and public resources.",
  },
  { loc: U.agentJsonAlias, type: "AgentDiscoveryAlias", encoding: "application/json", description: "Root alias for the agent discovery manifest." },
  {
    loc: U.wellKnownAgentAlias,
    type: "AgentDiscoveryAlias",
    encoding: "application/json",
    description: "Extensionless well-known alias for the agent discovery manifest.",
  },
  { loc: U.agentCard, type: "AgentCard", encoding: "application/json", description: "Agent card describing OpenDocs skills and capability boundaries." },
  { loc: U.llms, type: "LLMSText", encoding: "text/plain", description: "Concise agent-readable product context." },
  { loc: U.llmsFull, type: "LLMSFullText", encoding: "text/plain", description: "The full OpenDocs documentation in one file." },
  { loc: U.pricing, type: "PricingMarkdown", encoding: "text/markdown", description: "Machine-readable plans, features and limits." },
  { loc: U.skill, type: "AgentSkill", encoding: "text/markdown", description: "The OpenDocs agent skill (SKILL.md)." },
];

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** /schema-map.xml, advertised from /robots.txt. */
export function schemaMapXml() {
  const entries = SCHEMA_MAP_ENTRIES.map(
    (e) => `  <url>
    <loc>${escapeXml(e.loc)}</loc>
    <type>${escapeXml(e.type)}</type>
    <encoding>${escapeXml(e.encoding)}</encoding>
    <description>${escapeXml(e.description)}</description>
  </url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<schemaMap xmlns="${SITE}/ns/schema-map">
${entries}
</schemaMap>
`;
}

/** /schema-feeds/agent-resources.jsonl: schema.org records, one per line. */
export function agentResourcesJsonl() {
  const { pro, team } = PLAN_PRICES;
  const records = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: NAME,
      url: SITE,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: SUMMARY,
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
        { "@type": "Offer", name: "Pro", price: String(pro.monthly), priceCurrency: "USD", description: "Per month" },
        {
          "@type": "Offer",
          name: "Team",
          price: String(team.monthlyPerSeat),
          priceCurrency: "USD",
          description: `Per member per month, ${team.minSeats}-seat minimum`,
        },
      ],
      sameAs: [U.llms, U.pricing, U.openapi, U.agentJson, U.skill],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebAPI",
      name: `${NAME} API`,
      url: U.openapi,
      documentation: U.apiDocs,
      description:
        "REST API for publishing Markdown to shareable links, managing versions, projects, sharing and teams, and exporting PDF and Word files.",
      provider: { "@type": "Organization", name: NAME, url: SITE },
    },
    {
      "@context": "https://schema.org",
      "@type": "DataCatalog",
      name: `${NAME} agent discovery resources`,
      url: U.schemaMap,
      dataset: SCHEMA_MAP_ENTRIES.map((e) => ({
        "@type": "Dataset",
        name: e.type,
        url: e.loc,
        encodingFormat: e.encoding,
        description: e.description,
      })),
    },
  ];
  return `${records.map((r) => JSON.stringify(r)).join("\n")}\n`;
}

/**
 * A discovery response: built at build time, cached for an hour and
 * readable from any origin, since browser-based agents fetch these too.
 */
export function discoveryResponse(body: string | object, contentType = "application/json; charset=utf-8") {
  return new Response(typeof body === "string" ? body : `${JSON.stringify(body, null, 2)}\n`, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
