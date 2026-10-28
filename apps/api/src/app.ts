import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { toNodeHandler } from "better-auth/node";
import { isSelfHosted } from "@opendocs/shared/config/instance";

import { auth } from "./auth/index";
import { getConverterBaseUrl } from "./lib/converter";
import { clientAttribution } from "./middleware/client";
import { corsMiddleware } from "./middleware/cors";
import { errorShape } from "./middleware/error-shape";
import { errorHandler } from "./middleware/error-handler";
import { authRateLimit, generalRateLimit, getTrustProxyHops } from "./middleware/rate-limit";
import meRoutes from "./routes/me";
import onboardingRoutes from "./routes/onboarding";
import usernamesRoutes from "./routes/usernames";
import profileRoutes from "./routes/profile";
import publishRoutes from "./routes/publish";
import postsRoutes from "./routes/posts";
import apiKeysRoutes from "./routes/api-keys";
import workspaceRoutes from "./routes/workspace";
import workspaceDomainRoutes from "./routes/workspace-domain";
import projectRoutes from "./routes/projects";
import storageRoutes from "./routes/storage";
import accountRoutes from "./routes/account";
import toolsRoutes from "./routes/tools";
import authCodeRoutes from "./routes/auth-code";
import anonymousRoutes from "./routes/anonymous";
import brandingRoutes from "./routes/branding";
import teamRoutes from "./routes/team";
import integrationsRoutes from "./routes/integrations";
import telegramRoutes from "./routes/telegram";
import downloadRoutes from "./routes/downloads";
import mcpRoutes from "./routes/mcp";
import extensionRoutes from "./routes/extension";

export function createApp() {
  const app = express();

  // Derive req.ip from X-Forwarded-For set by our reverse proxy; see
  // getTrustProxyHops for why this matters for rate limiting.
  app.set("trust proxy", getTrustProxyHops());

  app.use(helmet());
  app.use(corsMiddleware);
  app.use(errorShape);
  app.use(clientAttribution);
  app.use(generalRateLimit);
  // Download-link tokens are credentials; keep them out of the access log.
  morgan.token("url", (req) => ((req as { originalUrl?: string }).originalUrl ?? req.url ?? "").replace(/\/downloads\/dl_[A-Za-z0-9_-]+/, "/downloads/dl_…"));
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
  app.use((req, res, next) => {
    // Batch publish streams; DocuSeal webhooks need the raw body for their HMAC.
    if (req.path === "/api/v1/publish/batch" || req.path.startsWith("/api/v1/integrations/docuseal/webhook/")) {
      next();
      return;
    }
    express.json({ limit: "2mb" })(req, res, next);
  });

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/healthz/converter", async (_req, res) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);

    try {
      const baseUrl = getConverterBaseUrl();
      const upstream = await fetch(`${baseUrl}/healthz`, {
        signal: controller.signal,
      });

      if (!upstream.ok) {
        res.status(502).json({
          status: "error",
          upstream: upstream.status,
        });
        return;
      }

      const body = (await upstream.json().catch(() => null)) as
        | Record<string, unknown>
        | null;
      res.json({ status: "ok", converter: body ?? { status: "ok" } });
    } catch (error) {
      res.status(503).json({
        status: "error",
        message: "Converter health check failed.",
      });
    } finally {
      clearTimeout(timeoutId);
    }
  });

  app.post("/api/auth/*splat", authRateLimit);
  app.all("/api/auth/*splat", toNodeHandler(auth));

  // A self-hosted instance has no anonymous publishing or free tools:
  // there, nobody reviews reported pages. Checked per request.
  app.use(["/api/v1/anonymous", "/api/v1/tools"], (_req, res, next) => {
    if (!isSelfHosted()) return next();
    res.status(404).json({
      error: "not_available",
      message: "Anonymous publishing and the free tools are off on this OpenDocs server. Sign in to publish.",
    });
  });

  app.use("/api/v1", meRoutes);
  app.use("/api/v1", onboardingRoutes);
  app.use("/api/v1", usernamesRoutes);
  app.use("/api/v1", profileRoutes);
  app.use("/api/v1", publishRoutes);
  app.use("/api/v1", postsRoutes);
  app.use("/api/v1", apiKeysRoutes);
  app.use("/api/v1", workspaceRoutes);
  app.use("/api/v1", workspaceDomainRoutes);
  app.use("/api/v1", brandingRoutes);
  app.use("/api/v1", projectRoutes);
  app.use("/api/v1", storageRoutes);
  app.use("/api/v1", accountRoutes);
  app.use("/api/v1", toolsRoutes);
  app.use("/api/v1", authCodeRoutes);
  app.use("/api/v1", anonymousRoutes);
  app.use("/api/v1", teamRoutes);
  app.use("/api/v1", integrationsRoutes);
  app.use("/api/v1", telegramRoutes);
  app.use("/api/v1", downloadRoutes);
  app.use("/api/v1", mcpRoutes);
  app.use("/api/v1", extensionRoutes);

  app.use(errorHandler);

  return app;
}
