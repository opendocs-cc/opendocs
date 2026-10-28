import { isExtensionOrigin } from "@opendocs/shared/extension/config";

/**
 * The browser extension exchanges and refreshes its OAuth tokens from its
 * service worker, which has no host permission for opendocs.cc, so the
 * token and revoke endpoints answer its origin with CORS. Nothing else in
 * Better Auth does: the extension never sends cookies (Better Auth only
 * checks the Origin of requests that carry them), and these two endpoints
 * take a code or a token, never a session.
 */
const EXTENSION_AUTH_PATH = /\/api\/auth\/oauth2\/(?:token|revoke)\/?$/;

function extensionOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!isExtensionOrigin(origin)) return null;
  return EXTENSION_AUTH_PATH.test(new URL(request.url).pathname) ? origin : null;
}

export function extensionPreflight(request: Request): Response {
  const origin = extensionOrigin(request);
  if (!origin) return new Response(null, { status: 204 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}

export function withExtensionCors(request: Request, response: Response): Response {
  const origin = extensionOrigin(request);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.append("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
