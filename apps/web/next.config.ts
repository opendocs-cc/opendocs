import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the monorepo root explicitly. Without this, Next.js walks upward
  // looking for a lockfile and can pick up stray ones (e.g. an empty
  // package-lock.json that got created in $HOME). Also ensures
  // `output: "standalone"` traces the correct file set for Docker.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  poweredByHeader: false,
  // Hand route handlers the URL as it was requested. Without this, Next.js
  // builds `request.url` with a regex that turns the first 127.x.x.x,
  // [::1] or localhost anywhere in the URL into "localhost". The server
  // runs on 0.0.0.0, so that first match is in the query string:
  // `redirect_uri=http://127.0.0.1:<port>/callback` from an MCP client
  // reached Better Auth as localhost and was rejected as unregistered.
  // Also skips the /_next/data normalization, which only the pages
  // router uses.
  skipMiddlewareUrlNormalize: true,
  async headers() {
    return [
      {
        // Every page, on opendocs.cc and on custom domains. Nothing of ours
        // is meant to be framed by another site (clickjacking), and
        // documents' raw HTML is sanitized, so `frame-ancestors 'self'`
        // costs nothing.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      {
        // HTTPS only, remembered for a year: opendocs.cc alone. Not on
        // customers' domains, which may move to a host without HTTPS after
        // they leave, and without includeSubDomains.
        source: "/:path*",
        has: [{ type: "host", value: "(?:www\\.)?opendocs\\.cc" }],
        headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000" }],
      },
    ];
  },
  async redirects() {
    return [
      // The short link for launch posts (Show HN): paste Markdown, get a link.
      { source: "/try", destination: "/tools/publish-markdown-online", permanent: true },
      // The AI answer tool lives at the slug people search for.
      { source: "/tools/ai-chat-to-pdf", destination: "/tools/chatgpt-to-pdf", permanent: true },
    ];
  },
};

export default nextConfig;
