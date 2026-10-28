import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";
import { startMockConverter, type MockConverter } from "../test-helpers/mock-converter";

/**
 * OAuth access tokens from MCP clients (Claude, ChatGPT, …): issued by
 * opendocs.cc for the MCP resource and accepted by the API as
 * authMethod "oauth", per-route scopes, Connected apps revocation, and the
 * download links MCP tools hand out instead of file bytes.
 */

const ISSUER_BASE = "http://issuer.test";
const RESOURCE = "http://mcp.test/mcp";
const CLIENT_ID = "https://claude.ai/oauth/test-client";

let jwksServer: Server;
let privateKey: CryptoKey;
let converter: MockConverter;
const savedEnv: Record<string, string | undefined> = {};

async function token(
  userId: string,
  options: { scope?: string; aud?: string; iat?: number; clientId?: string } = {},
) {
  const jwt = new SignJWT({
    scope: options.scope ?? "docs:read docs:write integrations workspace:admin",
    azp: options.clientId ?? CLIENT_ID,
  })
    .setProtectedHeader({ alg: "EdDSA", kid: "test-key", typ: "at+jwt" })
    .setSubject(userId)
    .setIssuer(`${ISSUER_BASE}/api/auth`)
    .setAudience(options.aud ?? RESOURCE)
    .setExpirationTime("1h");
  if (options.iat !== undefined) jwt.setIssuedAt(options.iat);
  else jwt.setIssuedAt();
  return jwt.sign(privateKey);
}

/** What the consent screen does: record the connection. */
async function connect(userId: string, workspaceId: string, clientId = CLIENT_ID) {
  const { upsertConnectionOnConsent } = await import("@opendocs/shared/mcp/connections");
  await upsertConnectionOnConsent({ userId, clientId, clientName: "Test client", workspaceId });
}

beforeAll(async () => {
  const pair = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  privateKey = pair.privateKey;
  const publicJwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "EdDSA" };
  jwksServer = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
  const port = (jwksServer.address() as AddressInfo).port;

  for (const key of ["OAUTH_JWKS_URL", "OAUTH_ISSUER_BASE_URL", "MCP_RESOURCE_URL", "DOC_CONVERTER_URL", "API_URL"]) {
    savedEnv[key] = process.env[key];
  }
  process.env.OAUTH_JWKS_URL = `http://127.0.0.1:${port}/jwks`;
  process.env.OAUTH_ISSUER_BASE_URL = ISSUER_BASE;
  process.env.MCP_RESOURCE_URL = RESOURCE;
  process.env.API_URL = "http://api.test";
  converter = await startMockConverter();
  process.env.DOC_CONVERTER_URL = converter.url;
});

afterAll(async () => {
  await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  await converter.close();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("MCP OAuth access tokens", () => {
  it("authenticates as the token's user and reports the connection", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();
    const accessToken = await token(user.userId);

    const unconnected = await request(app).get("/api/v1/me").set(authHeaders(accessToken));
    expect(unconnected.status).toBe(401);

    await connect(user.userId, user.workspaceId);
    const me = await request(app).get("/api/v1/me").set(authHeaders(accessToken));
    expect(me.status).toBe(200);
    expect(me.body.userId).toBe(user.userId);

    const connection = await request(app).get("/api/v1/mcp/connection").set(authHeaders(accessToken));
    expect(connection.status).toBe(200);
    expect(connection.body.clientId).toBe(CLIENT_ID);
    expect(connection.body.organize).toBe("ask");
  });

  it("rejects tokens for another audience, and session-only routes", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();
    await connect(user.userId, user.workspaceId);

    const wrongAudience = await request(app)
      .get("/api/v1/me")
      .set(authHeaders(await token(user.userId, { aud: "https://elsewhere.test/mcp" })));
    expect(wrongAudience.status).toBe(401);
    expect(wrongAudience.body.error).toBe("invalid_token");

    const apiKeys = await request(app).get("/api/v1/api-keys").set(authHeaders(await token(user.userId)));
    expect(apiKeys.status).toBe(401);
  });

  it("enforces scopes per route", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();
    await connect(user.userId, user.workspaceId);
    const readOnly = await token(user.userId, { scope: "docs:read" });

    const list = await request(app).get("/api/v1/posts").set(authHeaders(readOnly));
    expect(list.status).toBe(200);

    const publish = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(readOnly))
      .send({ markdown: "# Nope", workspaceId: user.workspaceId });
    expect(publish.status).toBe(403);
    expect(publish.body.error).toBe("insufficient_scope");
    expect(publish.body.scope).toBe("docs:write");

    const invite = await request(app)
      .post("/api/v1/workspace/team/invite")
      .set(authHeaders(await token(user.userId, { scope: "docs:read docs:write" })))
      .send({ email: "someone@example.com", role: "member", workspaceId: user.workspaceId });
    expect(invite.status).toBe(403);
    expect(invite.body.scope).toBe("workspace:admin");

    // Express ignores case and trailing slashes; the scope check must too.
    const readWrite = await token(user.userId, { scope: "docs:read docs:write" });
    for (const path of ["/API/V1/Workspace/team/invite", "/api/v1/workspace/team/invite/"]) {
      const sneaky = await request(app)
        .post(path)
        .set(authHeaders(readWrite))
        .send({ email: "someone@example.com", role: "member", workspaceId: user.workspaceId });
      expect(sneaky.status, path).toBe(403);
      expect(sneaky.body.scope, path).toBe("workspace:admin");
    }
    const integrations = await request(app).get("/api/v1/Integrations/").set(authHeaders(readWrite)).query({
      workspaceId: user.workspaceId,
    });
    expect(integrations.status).toBe(403);
    expect(integrations.body.scope).toBe("integrations");

    // Export links only need read access; signature PDFs need integrations.
    const signatureLink = await request(app)
      .post("/api/v1/download-links")
      .set(authHeaders(readWrite))
      .send({ kind: "signature_document", requestId: "anything", document: "signed" });
    expect(signatureLink.status).toBe(403);
    expect(signatureLink.body.scope).toBe("integrations");
  });

  it("records publishes from the connection and stops working once disconnected", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();
    const issuedAt = Math.floor(Date.now() / 1000) - 5;
    const accessToken = await token(user.userId, { iat: issuedAt, clientId: "https://chatgpt.com/oauth/client.json" });
    await connect(user.userId, user.workspaceId, "https://chatgpt.com/oauth/client.json");

    const publish = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(accessToken))
      .set("X-OpenDocs-Client", "chatgpt/mcp")
      .send({ markdown: "# From ChatGPT\n\nHello", workspaceId: user.workspaceId });
    expect(publish.status).toBe(201);

    const versions = await request(app)
      .get(`/api/v1/posts/${publish.body.postId}/versions`)
      .set(authHeaders(user.apiKey));
    expect(versions.body.versions[0].client).toBe("chatgpt/mcp");

    const { revokeConnection, getConnection, forgetConnectionCache } = await import(
      "@opendocs/shared/mcp/connections"
    );
    const connection = await getConnection(user.userId, "https://chatgpt.com/oauth/client.json");
    expect(connection).not.toBeNull();
    expect(await revokeConnection(user.userId, connection!.id)).toBe(true);
    forgetConnectionCache(user.userId, "https://chatgpt.com/oauth/client.json");

    const after = await request(app).get("/api/v1/me").set(authHeaders(accessToken));
    expect(after.status).toBe(401);
  });

  it("keeps connection defaults per connection", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();
    await connect(user.userId, user.workspaceId);
    const accessToken = await token(user.userId);
    const created = await request(app)
      .post("/api/v1/projects")
      .set(authHeaders(user.apiKey))
      .send({ workspaceId: user.workspaceId, name: "Legal" });
    expect(created.status).toBeLessThan(300);

    const set = await request(app)
      .put("/api/v1/mcp/connection")
      .set(authHeaders(accessToken))
      .send({ workspaceId: user.workspaceId, projectId: created.body.project.id, organize: "auto" });
    expect(set.status).toBe(200);
    expect(set.body.project.name).toBe("Legal");
    expect(set.body.organize).toBe("auto");

    const apiKeyCaller = await request(app).get("/api/v1/mcp/connection").set(authHeaders(user.apiKey));
    expect(apiKeyCaller.status).toBe(400);
  });
});

describe("document search and download links", () => {
  it("searches titles", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();
    for (const title of ["Acme NDA", "Board memo"]) {
      await request(app)
        .post("/api/v1/publish")
        .set(authHeaders(user.apiKey))
        .send({ markdown: `# ${title}\n\nText`, title, workspaceId: user.workspaceId });
    }
    const res = await request(app)
      .get("/api/v1/posts")
      .query({ workspaceId: user.workspaceId, q: "acme" })
      .set(authHeaders(user.apiKey));
    expect(res.status).toBe(200);
    expect(res.body.posts.map((p: { title: string }) => p.title)).toEqual(["Acme NDA"]);
  });

  it("hands out an hour-long link that renders the export as the user", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();
    const other = await createOnboardedUser();
    const publish = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({ markdown: "# Contract\n\nBody", workspaceId: user.workspaceId, visibility: "private" });

    const denied = await request(app)
      .post("/api/v1/download-links")
      .set(authHeaders(other.apiKey))
      .send({ kind: "post_export", document: publish.body.postId, format: "pdf" });
    expect(denied.status).toBe(404);

    const docx = await request(app)
      .post("/api/v1/download-links")
      .set(authHeaders(user.apiKey))
      .send({ kind: "post_export", document: publish.body.postId, format: "docx" });
    expect(docx.status).toBe(403);

    const link = await request(app)
      .post("/api/v1/download-links")
      .set(authHeaders(user.apiKey))
      .send({ kind: "post_export", document: publish.body.postId, format: "pdf" });
    expect(link.status).toBe(201);
    expect(link.body.url).toMatch(/^http:\/\/api\.test\/api\/v1\/downloads\/dl_/);
    expect(link.body.filename).toBe(`${publish.body.slug}.pdf`);

    const path = new URL(link.body.url).pathname;
    const file = await request(app).get(path);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toMatch(/application\/pdf/);
    expect(file.headers["content-disposition"]).toContain(`${publish.body.slug}.pdf`);
    expect(converter.calls.at(-1)?.format).toBe("pdf");

    const bogus = await request(app).get("/api/v1/downloads/dl_notarealtokenatallxxxxxxxx");
    expect(bogus.status).toBe(410);
  });
});
