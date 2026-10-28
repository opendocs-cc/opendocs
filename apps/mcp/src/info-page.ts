import { config } from "./config";

/** What someone sees when they open the server URL in a browser. */
export function infoPage(): string {
  const setup = `${config.webUrl}/mcp`;
  const claude = `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=OpenDocs.cc&connectorUrl=${encodeURIComponent(config.resourceUrl)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>OpenDocs MCP server</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #fafafa; color: #171717; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
  main { max-width: 560px; margin: 0 auto; padding: 64px 16px; }
  .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 28px; }
  h1 { font-size: 24px; line-height: 1.3; margin: 8px 0 12px; }
  .eyebrow { color: #6941c6; font-size: 14px; font-weight: 600; margin: 0; }
  code { display: block; background: #f4f0fd; color: #53389e; border-radius: 8px; padding: 10px 12px; font-size: 14px; word-break: break-all; margin: 8px 0 16px; }
  a.button { display: inline-block; background: #6941c6; color: #fff; text-decoration: none; font-weight: 600; border-radius: 8px; padding: 10px 16px; margin-right: 12px; }
  a { color: #6941c6; }
  p { margin: 0 0 12px; color: #404040; }
</style>
</head>
<body>
<main>
  <div class="card">
    <p class="eyebrow">OpenDocs.cc</p>
    <h1>This is the OpenDocs MCP server</h1>
    <p>Add this address to Claude, ChatGPT, Cursor or another AI app to publish, share and export your OpenDocs documents from a chat:</p>
    <code>${config.resourceUrl}</code>
    <p><a class="button" href="${claude}">Add to Claude</a><a href="${setup}">Setup for every app</a></p>
  </div>
</main>
</body>
</html>`;
}
