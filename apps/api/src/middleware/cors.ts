import cors, { type CorsOptions } from "cors";
import type { Request } from "express";

import { isServingCustomOrigin } from "@opendocs/shared/custom-domains/service";
import { isExtensionOrigin } from "@opendocs/shared/extension/config";

const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

const ALLOWED_HEADERS = ["Content-Type", "Authorization", "X-OpenDocs-Client"];

// The public endpoints reader pages call from the browser: PDF, Word and
// Markdown downloads of a document and a workspace's "download all" zip.
const PUBLIC_READER_PATH = /^\/api\/v1\/public\/(?:posts|workspaces)\//;

/**
 * CORS per request:
 *
 *   - Our own origins (CORS_ORIGINS: opendocs.cc, localhost in development)
 *     get everything, with credentials, as before.
 *   - Custom domains that serve right now (notes.example.com) may call the
 *     public reader endpoints only, and without credentials: those
 *     endpoints are public, so a customer's page never needs, or gets, a
 *     way to make requests with an OpenDocs session. Requests still come
 *     straight from the reader's browser, so rate limits stay per reader.
 *   - The OpenDocs browser extension (chrome-extension://<id>, the IDs in
 *     @opendocs/shared/extension/config) gets the whole API without
 *     credentials. It calls from its service worker with a bearer token (or
 *     nothing, for anonymous publishing), never with a session cookie.
 *   - Anything else gets no CORS headers, and the browser blocks it.
 */
export const corsMiddleware = cors((req, callback) => {
  const origin = (req as Request).headers.origin;
  const path = (req as Request).path;
  const deny: CorsOptions = { origin: false };

  if (!origin) {
    callback(null, deny);
    return;
  }
  if (allowedOrigins.includes(origin)) {
    callback(null, {
      origin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ALLOWED_HEADERS,
    });
    return;
  }
  if (isExtensionOrigin(origin)) {
    callback(null, {
      origin,
      credentials: false,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ALLOWED_HEADERS,
      maxAge: 600,
    });
    return;
  }
  if (!PUBLIC_READER_PATH.test(path)) {
    callback(null, deny);
    return;
  }
  isServingCustomOrigin(origin)
    .then((serving) => {
      callback(
        null,
        serving
          ? {
              origin,
              credentials: false,
              methods: ["GET", "POST", "OPTIONS"],
              allowedHeaders: ["Content-Type"],
              maxAge: 600,
            }
          : deny,
      );
    })
    .catch(() => callback(null, deny));
});
