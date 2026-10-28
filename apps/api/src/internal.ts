import express from "express";

import { isTlsAllowedForHostname } from "@opendocs/shared/custom-domains/service";

/**
 * Endpoints for other containers only, served on their own port
 * (INTERNAL_PORT, 4001) that docker-compose never publishes and Caddy never
 * proxies, so nothing outside the Docker network can reach them.
 */
export function createInternalApp() {
  const app = express();
  app.disable("x-powered-by");

  // Caddy's on-demand TLS `ask` (deploy/Caddyfile): before requesting a
  // certificate for a hostname it hasn't seen, Caddy asks here. 200 only
  // for verified custom domains on Pro or Team workspaces; anything else
  // gets 404 and no certificate, so pointing a domain at our IP can't make
  // us request certificates (or run into Let's Encrypt's rate limits).
  app.get("/internal/tls-ask", async (req, res) => {
    const domain = typeof req.query.domain === "string" ? req.query.domain : "";
    try {
      if (domain && (await isTlsAllowedForHostname(domain))) {
        res.status(200).type("text/plain").send("ok");
        return;
      }
      res.status(404).type("text/plain").send("not found");
    } catch (error) {
      console.error("[tls-ask] Lookup failed:", error);
      res.status(503).type("text/plain").send("unavailable");
    }
  });

  app.get("/internal/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use((_req, res) => {
    res.status(404).type("text/plain").send("not found");
  });

  return app;
}
