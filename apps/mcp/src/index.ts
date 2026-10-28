import "dotenv/config";
import type { NextFunction, Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";

import { requireMcpToken } from "./auth";
import { REQUESTED_SCOPES, config } from "./config";
import { infoPage } from "./info-page";
import { buildServer } from "./server";

/**
 * The OpenDocs MCP server (mcp.opendocs.cc). Streamable HTTP at /mcp,
 * protected by OAuth access tokens from opendocs.cc; serves both the
 * 2026-07-28 protocol and 2025-era clients (stateless). Tools call the
 * REST API as the signed-in user; this process holds no database or
 * storage credentials.
 */

const MAX_BODY_BYTES = 16 * 1024 * 1024; // a 25-document batch of large Markdown

const app = createMcpExpressApp({
  host: "0.0.0.0",
  allowedHosts: config.allowedHosts,
  // Requests without an Origin (every hosted client calls server to server)
  // pass; browser-based clients are limited to these.
  allowedOrigins: ["localhost", "127.0.0.1", "claude.ai", "chatgpt.com", "vscode.dev", ...config.allowedHosts],
  jsonLimit: "16mb",
});
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Bearer tokens, no cookies: any origin may read responses.
function cors(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Last-Event-ID",
  );
  res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

function protectedResourceMetadata(_req: Request, res: Response) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({
    resource: config.resourceUrl,
    authorization_servers: [config.issuer],
    scopes_supported: [...REQUESTED_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "OpenDocs.cc",
    // A self-hosted instance has no website of its own: the docs, and no
    // opendocs.cc policies.
    ...(config.selfHosted
      ? { resource_documentation: "https://docs.opendocs.cc/integrations/mcp" }
      : {
          resource_documentation: `${config.webUrl}/mcp`,
          resource_policy_uri: `${config.webUrl}/privacy`,
          resource_tos_uri: `${config.webUrl}/terms`,
        }),
  });
}

/** Per-connection ceiling on MCP requests (the API has its own limits too). */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 240;
const counters = new Map<string, { windowStart: number; count: number }>();
function connectionRateLimit(req: Request, res: Response, next: NextFunction) {
  const auth = (req as Request & { auth?: { clientId: string; extra?: { userId?: unknown } } }).auth;
  const key = `${String(auth?.extra?.userId ?? "anon")}:${auth?.clientId ?? ""}`;
  const now = Date.now();
  const entry = counters.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    counters.set(key, { windowStart: now, count: 1 });
  } else if (++entry.count > MAX_PER_WINDOW) {
    res.setHeader("Retry-After", String(Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000)));
    res.status(429).json({ error: "rate_limited", message: "Too many requests. Wait a minute and try again." });
    return;
  }
  if (counters.size > 50_000) {
    for (const [k, v] of counters) if (now - v.windowStart >= WINDOW_MS) counters.delete(k);
  }
  next();
}

const handler = createMcpHandler(buildServer, {
  maxRequestBodySize: MAX_BODY_BYTES,
  onerror: (error) => console.error("[mcp] handler error", error),
});
const nodeHandler = toNodeHandler(handler, {
  maxRequestBodySize: MAX_BODY_BYTES,
  onerror: (error) => console.error("[mcp] adapter error", error),
});

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/.well-known", cors);
app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);
app.get("/.well-known/oauth-protected-resource/mcp", protectedResourceMetadata);
// Domain verification for OpenAI's plugin directory: the token, and nothing else.
app.get("/.well-known/openai-apps-challenge", (_req, res) => {
  if (!config.openaiAppsChallenge) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.type("text/plain").send(config.openaiAppsChallenge);
});

// People paste the server URL into a browser; tell them what it is.
function browserVisit(req: Request): boolean {
  return req.method === "GET" && !req.headers.authorization && (req.headers.accept ?? "").includes("text/html");
}
app.get("/", (_req, res) => {
  res.type("html").send(infoPage());
});

app.use("/mcp", cors);
app.all("/mcp", (req, res, next) => {
  if (browserVisit(req)) {
    res.type("html").send(infoPage());
    return;
  }
  next();
});
app.all("/mcp", requireMcpToken, connectionRateLimit, (req, res) => {
  void nodeHandler(req, res, req.body);
});

app.listen(config.port, () => {
  console.log(`[mcp] OpenDocs MCP server on :${config.port} (resource ${config.resourceUrl})`);
});
