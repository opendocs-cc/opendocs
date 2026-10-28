import type { Metadata } from "next";

import { requireServerSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/format-date";
import { listConnections } from "@opendocs/shared/mcp/connections";
import { MCP_SCOPE_DETAILS, type McpScope } from "@opendocs/shared/mcp/config";

import { ConnectedAppsClient } from "./connected-apps-client";

export const metadata: Metadata = { title: "Connected apps" };

export default async function ConnectedAppsPage() {
  const session = await requireServerSession();
  const connections = await listConnections(session.user.id);

  return (
    <ConnectedAppsClient
      initialApps={connections.map((c) => ({
        id: c.id,
        name: c.name,
        host: c.host,
        verified: c.verified,
        workspaceName: c.workspaceName,
        permissions: c.scopes
          .filter((scope): scope is McpScope => scope in MCP_SCOPE_DETAILS)
          .map((scope) => MCP_SCOPE_DETAILS[scope].label),
        connectedAt: formatDate(c.connectedAt),
        lastUsedAt: c.lastUsedAt ? formatDate(c.lastUsedAt) : null,
      }))}
    />
  );
}
