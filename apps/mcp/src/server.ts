import { McpServer, type AuthInfo, type McpRequestContext } from "@modelcontextprotocol/server";

import { ApiClient } from "./api-client";
import { config } from "./config";
import { INSTRUCTIONS } from "./instructions";
import { identifyClient } from "./lib/client";
import { ToolContext } from "./lib/context";
import { apiErrorResult } from "./lib/errors";
import { TOOLS } from "./tools";

const SERVER_ICON = `${config.webUrl}/opendocs-icon.svg`;

/**
 * Builds the MCP server for one request (createMcpHandler calls this per
 * request; nothing is kept between calls). The tools a connection sees
 * depend on the scopes the user granted on the consent screen.
 */
export function buildServer(ctx: McpRequestContext): McpServer {
  const server = new McpServer(
    {
      name: "opendocs",
      title: "OpenDocs.cc",
      version: config.version,
      description: "Publish Markdown as shareable documents, export PDF and Word, share, and send for e-signature.",
      // A self-hosted instance has no /mcp page; the docs explain the server.
      websiteUrl: config.selfHosted ? "https://docs.opendocs.cc/integrations/mcp" : `${config.webUrl}/mcp`,
      icons: [{ src: SERVER_ICON, mimeType: "image/svg+xml" }],
    },
    { instructions: INSTRUCTIONS, capabilities: { tools: {} } },
  );

  const authInfo: AuthInfo | undefined = ctx.authInfo;
  if (!authInfo) return server;

  const scopes = new Set(authInfo.scopes);
  const client = identifyClient(authInfo.clientId, ctx.requestInfo?.headers.get("user-agent") ?? null);
  const toolContext = () => new ToolContext(new ApiClient(authInfo.token, client.header), scopes, client);

  for (const tool of TOOLS) {
    if (!scopes.has(tool.scope)) continue;
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: { title: tool.title, ...tool.annotations },
        ...(tool.meta ? { _meta: tool.meta } : {}),
      },
      async (args: unknown) => {
        const started = Date.now();
        let outcome = "ok";
        try {
          const result = await tool.run(args as never, toolContext());
          if (result.isError) outcome = "tool_error";
          return result;
        } catch (err) {
          outcome = "error";
          return apiErrorResult(err);
        } finally {
          // Tool name, client and outcome only: never arguments or document content.
          console.log(
            JSON.stringify({
              event: "mcp_tool_call",
              tool: tool.name,
              client: client.slug,
              era: ctx.era,
              outcome,
              ms: Date.now() - started,
            }),
          );
        }
      },
    );
  }
  return server;
}
