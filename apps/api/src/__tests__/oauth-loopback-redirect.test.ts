import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import nextConfig from "../../../web/next.config";

/**
 * MCP clients that sign in through a loopback redirect on 127.0.0.1 or
 * [::1] (RFC 8252), e.g. `redirect_uri=http://127.0.0.1:<port>/callback`.
 *
 * Next.js builds `request.url` for route handlers with a regex that turns
 * the first 127.x.x.x, [::1] or localhost anywhere in the URL into
 * "localhost". The web app listens on 0.0.0.0, so on a real server that
 * first match is the redirect_uri, and Better Auth saw a URI the client
 * never registered. `skipMiddlewareUrlNormalize` turns that off; Next
 * compiles it into the server build as __NEXT_NO_MIDDLEWARE_URL_NORMALIZE,
 * which is set here from next.config the same way.
 */

const SERVER = "http://0.0.0.0:3000"; // how Next sees requests in the Docker image
const NORMALIZE_FLAG = "__NEXT_NO_MIDDLEWARE_URL_NORMALIZE";

type Auth = typeof import("../../../web/lib/auth")["auth"];
let auth: Auth;
let savedFlag: string | undefined;

function setNextUrlNormalize(skip: boolean) {
  if (skip) process.env[NORMALIZE_FLAG] = "1";
  else delete process.env[NORMALIZE_FLAG];
}

function authorizeUrl(clientId: string, redirectUri: string) {
  const url = new URL("/api/auth/oauth2/authorize", SERVER);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "docs:read",
    code_challenge: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ",
    code_challenge_method: "S256",
    state: "loopback-test",
  }).toString();
  return url;
}

async function register(redirectUri: string): Promise<string> {
  const res = await auth.handler(
    new Request(`${SERVER}/api/auth/oauth2/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Loopback test client",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
    }),
  );
  const body = (await res.json()) as { client_id?: string };
  if (!body.client_id) throw new Error(`Registration failed: ${JSON.stringify(body)}`);
  return body.client_id;
}

/** Where the authorize endpoint sends the browser: login on success, an error page otherwise. */
async function authorize(clientId: string, redirectUri: string): Promise<URL> {
  const res = await auth.handler(new NextRequest(authorizeUrl(clientId, redirectUri)));
  const location = res.headers.get("location");
  if (!location) throw new Error(`No redirect (${res.status}): ${await res.text()}`);
  return new URL(location, SERVER);
}

beforeAll(async () => {
  savedFlag = process.env[NORMALIZE_FLAG];
  ({ auth } = await import("../../../web/lib/auth"));
});

afterAll(() => {
  if (savedFlag === undefined) delete process.env[NORMALIZE_FLAG];
  else process.env[NORMALIZE_FLAG] = savedFlag;
});

describe("Next.js request URLs", () => {
  it("rewrite a 127.0.0.1 redirect_uri to localhost unless normalization is skipped", () => {
    const url = authorizeUrl("client", "http://127.0.0.1:53682/callback");
    const redirectUri = (skip: boolean) => {
      setNextUrlNormalize(skip);
      return new URL(new NextRequest(url).url).searchParams.get("redirect_uri");
    };

    expect(redirectUri(false)).toBe("http://localhost:53682/callback");
    expect(redirectUri(true)).toBe("http://127.0.0.1:53682/callback");
  });

  it("is configured to skip it", () => {
    expect(nextConfig.skipMiddlewareUrlNormalize).toBe(true);
  });
});

describe("OAuth loopback redirects", () => {
  beforeAll(() => setNextUrlNormalize(nextConfig.skipMiddlewareUrlNormalize === true));

  it.each([
    ["127.0.0.1", "http://127.0.0.1:53682/callback", "http://127.0.0.1:53682/callback"],
    ["127.0.0.1 on another port", "http://127.0.0.1:53682/callback", "http://127.0.0.1:61234/callback"],
    ["127.0.0.1 registered without a port", "http://127.0.0.1/callback", "http://127.0.0.1:49152/callback"],
    ["[::1]", "http://[::1]:53682/callback", "http://[::1]:40000/callback"],
    ["localhost", "http://localhost:53682/callback", "http://localhost:53682/callback"],
  ])("accepts %s", async (_name, registered, requested) => {
    const clientId = await register(registered);
    const location = await authorize(clientId, requested);

    expect(location.searchParams.get("error")).toBeNull();
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect_uri")).toBe(requested);
  });

  it.each([
    ["localhost for a 127.0.0.1 client", "http://127.0.0.1:53682/callback", "http://localhost:53682/callback"],
    ["127.0.0.1 for a localhost client", "http://localhost:53682/callback", "http://127.0.0.1:53682/callback"],
    ["another loopback address", "http://127.0.0.1:53682/callback", "http://127.0.0.2:53682/callback"],
    ["another path", "http://127.0.0.1:53682/callback", "http://127.0.0.1:53682/other"],
    ["a non-loopback host on another port", "https://app.example.com/callback", "https://app.example.com:8443/callback"],
  ])("rejects %s", async (_name, registered, requested) => {
    const clientId = await register(registered);
    const location = await authorize(clientId, requested);

    expect(location.searchParams.get("error")).toBe("invalid_redirect");
  });
});
