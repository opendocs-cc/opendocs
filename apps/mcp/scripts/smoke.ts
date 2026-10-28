/**
 * End-to-end smoke test against a running MCP server (local stack or
 * production): connects with a real access token, lists tools, and runs the
 * everyday flow — account, publish, read, edit, search, export, share,
 * history, unpublish, delete. Also checks the 401 challenge and a
 * 2025-era (initialize) client.
 *
 *   MCP_URL=http://localhost:4160/mcp MCP_TOKEN=<access token> npx tsx apps/mcp/scripts/smoke.ts
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = process.env.MCP_URL ?? "http://localhost:4160/mcp";
const token = process.env.MCP_TOKEN;
if (!token) {
  console.error("Set MCP_TOKEN to an access token for this server.");
  process.exit(1);
}

let failures = 0;
function check(label: string, condition: unknown, detail?: unknown) {
  if (condition) console.log(`  ok  ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}`, detail ?? "");
  }
}

type ToolResult = { content?: Array<{ type: string; text?: string }>; isError?: boolean; structuredContent?: Record<string, unknown> };
const text = (r: ToolResult) => (r.content ?? []).map((c) => c.text ?? "").join("\n");

async function main() {
  console.log("Unauthenticated request");
  const anon = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const challenge = anon.headers.get("www-authenticate") ?? "";
  check("401 with resource_metadata and every scope", anon.status === 401 && challenge.includes("resource_metadata=") && challenge.includes("workspace:admin"), challenge);

  console.log("2025-era client (initialize, stateless)");
  const legacyHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`,
    "MCP-Protocol-Version": "2025-06-18",
  };
  const init = await fetch(url, {
    method: "POST",
    headers: legacyHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke-legacy", version: "1" } },
    }),
  });
  const initBody = await init.text();
  check("initialize answers with instructions", init.ok && initBody.includes("instructions"), initBody.slice(0, 300));
  const legacyList = await fetch(url, {
    method: "POST",
    headers: legacyHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  });
  const legacyListBody = await legacyList.text();
  check("legacy tools/list works", legacyList.ok && legacyListBody.includes("publish_document"), legacyListBody.slice(0, 200));

  console.log("Current-protocol client");
  const client = new Client({ name: "opendocs-smoke", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
  );
  const { tools } = await client.listTools();
  console.log(`  ${tools.length} tools`);
  check("tools listed with annotations", tools.length >= 20 && tools.every((t) => t.annotations?.title), tools.length);

  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as ToolResult;

  const account = await call("get_account");
  check("get_account", !account.isError && text(account).includes("Default workspace"), text(account));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const published = await call("publish_document", {
    markdown: `# Smoke test ${stamp}\n\nThe effective date is 1 January 2026.\n\n## Parties\n\nAcme and OpenDocs.`,
    project: `Smoke tests`,
    tags: ["smoke"],
  });
  check("publish_document", !published.isError && text(published).includes("http"), text(published));
  const id = String(published.structuredContent?.id ?? "");

  const read = await call("get_document", { document: id });
  check("get_document returns the Markdown", text(read).includes("effective date is 1 January 2026"), text(read).slice(0, 300));
  const version = Number((read.structuredContent as { version?: number })?.version ?? 1);

  const edited = await call("edit_document", {
    document: id,
    edits: [{ find: "1 January 2026", replace: "1 February 2026" }],
    base_version: version,
  });
  check("edit_document makes version 2", !edited.isError && text(edited).includes("version 2"), text(edited));

  const conflict = await call("edit_document", {
    document: id,
    edits: [{ find: "February", replace: "March" }],
    base_version: version,
  });
  check("edit_document refuses a stale base_version", conflict.isError === true, text(conflict));

  const missing = await call("edit_document", { document: id, edits: [{ find: "no such text", replace: "x" }] });
  check("edit_document reports text it can't find", missing.isError === true && text(missing).includes("isn't in the document"), text(missing));

  const search = await call("list_documents", { query: `Smoke test ${stamp}` });
  check("list_documents finds it by title", text(search).includes(id), text(search).slice(0, 300));

  const exported = await call("export_document", { documents: [id] });
  const exportUrl = /https?:\/\/\S+\/downloads\/dl_\S+/.exec(text(exported))?.[0];
  check("export_document returns a download link", Boolean(exportUrl), text(exported));
  if (exportUrl) {
    const file = await fetch(exportUrl);
    const bytes = new Uint8Array(await file.arrayBuffer());
    check(
      "the link downloads a PDF",
      file.ok && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF",
      `${file.status} ${file.headers.get("content-type")}`,
    );
  }

  const publicNoConfirm = await call("set_document_visibility", { document: id, visibility: "public" });
  check("making it public without confirmation is refused", publicNoConfirm.isError === true, text(publicNoConfirm));

  const shared = await call("share_document", { document: id, add: ["guest@example.test"], notify: false });
  check("share_document", !shared.isError && text(shared).includes("guest@example.test"), text(shared));

  const history = await call("get_document_history", { document: id });
  check("get_document_history lists v2", text(history).includes("v2"), text(history));

  const projects = await call("list_projects");
  check("list_projects shows the new project", text(projects).includes("Smoke tests"), text(projects));

  const unpublished = await call("unpublish_document", { document: id });
  check("unpublish_document", !unpublished.isError, text(unpublished));

  const noConfirm = await call("delete_document", { document: id, confirm: false });
  check("delete_document needs confirm", noConfirm.isError === true, text(noConfirm));
  const deleted = await call("delete_document", { document: id, confirm: true });
  check("delete_document", !deleted.isError, text(deleted));

  const bad = await call("get_document", { document: "this-does-not-exist-anywhere" });
  check("unknown documents give an actionable error", bad.isError === true && /list_documents/.test(text(bad)), text(bad));

  await client.close();
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
