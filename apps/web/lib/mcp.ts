/**
 * The OpenDocs MCP server: its URL, OAuth metadata and the install links
 * and snippets for each app. One source for the /mcp page, the footer, the
 * integration pages, the dashboard card and the agent discovery files.
 * The addresses are this instance's (lib/instance.ts in @opendocs/shared).
 */

import { instanceMcpUrl, instanceWebUrl } from "@opendocs/shared/config/instance";

export const MCP_SERVER_URL = instanceMcpUrl();
/** The server's key in client configs (`claude mcp add … opendocs`). */
export const MCP_SERVER_NAME = "opendocs";
/** The name shown in connector lists and directories. */
export const MCP_DISPLAY_NAME = "OpenDocs.cc";

export const MCP_PAGE_PATH = "/mcp";
export const MCP_PAGE_URL = `${instanceWebUrl()}/mcp`;
export const MCP_DOCS_URL = "https://docs.opendocs.cc/integrations/mcp";
export const MCP_TOOLS_DOCS_URL = "https://docs.opendocs.cc/reference/mcp-tools";
/** Where people see and revoke the apps they connected. */
export const CONNECTED_APPS_PATH = "/dashboard/connected-apps";

export const OAUTH_ISSUER = `${instanceWebUrl()}/api/auth`;
export const OAUTH_AUTHORIZATION_SERVER_METADATA_URL = `${instanceWebUrl()}/.well-known/oauth-authorization-server/api/auth`;
export const OAUTH_PROTECTED_RESOURCE_METADATA_URL = `${new URL(instanceMcpUrl()).origin}/.well-known/oauth-protected-resource${new URL(instanceMcpUrl()).pathname}`;

/**
 * claude.ai's "Add custom connector" dialog with the name and URL filled
 * in. `admin` is the Team and Enterprise variant, where an owner adds the
 * connector for the whole organization.
 */
export function claudeConnectorUrl({ admin = false }: { admin?: boolean } = {}) {
  const path = admin ? "/admin-settings/connectors" : "/customize/connectors";
  const query = `modal=add-custom-connector&connectorName=${encodeURIComponent(MCP_DISPLAY_NAME)}&connectorUrl=${encodeURIComponent(MCP_SERVER_URL)}`;
  return `https://claude.ai${path}?${query}`;
}

export const CLAUDE_CONNECTOR_URL = claudeConnectorUrl();
export const CLAUDE_ADMIN_CONNECTOR_URL = claudeConnectorUrl({ admin: true });

/** OpenDocs.cc in ChatGPT's plugin directory, where Install plugin connects it. */
export const CHATGPT_PLUGIN_URL = "https://chatgpt.com/plugins/plugin_asdk_app_6adfe2405774819198b9b9c92fffaaa8";
/** ChatGPT → Settings → Plugins, where "+" adds a custom MCP server by hand. */
export const CHATGPT_PLUGINS_URL = "https://chatgpt.com/plugins";

export const CLAUDE_CODE_ADD_COMMAND = `claude mcp add --transport http --scope user ${MCP_SERVER_NAME} ${MCP_SERVER_URL}`;

/** The Codex CLI, its IDE extension and the ChatGPT desktop app share this config. */
export const CODEX_ADD_COMMAND = `codex mcp add ${MCP_SERVER_NAME} --url ${MCP_SERVER_URL}`;
export const CODEX_LOGIN_COMMAND = `codex mcp login ${MCP_SERVER_NAME}`;
export const CODEX_CONFIG_TOML = `[mcp_servers.${MCP_SERVER_NAME}]
url = "${MCP_SERVER_URL}"`;

/** Cursor's install deeplink: the config is base64 JSON. */
export const CURSOR_INSTALL_URL = `cursor://anysphere.cursor-deeplink/mcp/install?name=${MCP_SERVER_NAME}&config=${btoa(
  JSON.stringify({ url: MCP_SERVER_URL }),
)}`;
export const CURSOR_CONFIG_JSON = JSON.stringify(
  { mcpServers: { [MCP_SERVER_NAME]: { url: MCP_SERVER_URL } } },
  null,
  2,
);

const VSCODE_SERVER = { name: MCP_SERVER_NAME, type: "http", url: MCP_SERVER_URL };
export const VSCODE_INSTALL_URL = `vscode:mcp/install?${encodeURIComponent(JSON.stringify(VSCODE_SERVER))}`;
export const VSCODE_ADD_COMMAND = `code --add-mcp '${JSON.stringify(VSCODE_SERVER)}'`;
export const VSCODE_CONFIG_JSON = JSON.stringify(
  { servers: { [MCP_SERVER_NAME]: { type: "http", url: MCP_SERVER_URL } } },
  null,
  2,
);

/** Windsurf (Devin Desktop) and Antigravity use `serverUrl`. */
export const SERVER_URL_CONFIG_JSON = JSON.stringify(
  { mcpServers: { [MCP_SERVER_NAME]: { serverUrl: MCP_SERVER_URL } } },
  null,
  2,
);
export const ANTIGRAVITY_CONFIG_PATH = "~/.gemini/config/mcp_config.json";
export const GEMINI_CLI_ADD_COMMAND = `gemini mcp add --transport http ${MCP_SERVER_NAME} ${MCP_SERVER_URL}`;

/** Zed: goes in settings.json. */
export const ZED_CONFIG_JSON = JSON.stringify(
  { context_servers: { [MCP_SERVER_NAME]: { url: MCP_SERVER_URL } } },
  null,
  2,
);

/** For JetBrains AI Assistant and any app that only runs local (stdio) servers. */
export const MCP_REMOTE_COMMAND = `npx -y mcp-remote ${MCP_SERVER_URL}`;
export const MCP_REMOTE_CONFIG_JSON = JSON.stringify(
  { mcpServers: { [MCP_SERVER_NAME]: { command: "npx", args: ["-y", "mcp-remote", MCP_SERVER_URL] } } },
  null,
  2,
);

/** OpenDocs CLI shortcuts. */
export const CLI_MCP_ADD_COMMAND = "opendocs mcp add";
export const CLI_MCP_CONNECT_CLAUDE_COMMAND = "opendocs mcp connect claude";
export const CLI_MCP_CONNECT_CHATGPT_COMMAND = "opendocs mcp connect chatgpt";
