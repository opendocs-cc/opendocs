import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(32, "Username must be at most 32 characters.")
  .regex(
    /^[a-z0-9_-]+$/,
    "Username may contain lowercase letters, numbers, hyphens, and underscores only.",
  );

// Shared reserved slugs — used by both username and workspace slug validation.
// Any string that could collide with an existing or future route, brand term,
// or well-known path should live here so neither namespace can claim it.
export const RESERVED_SLUGS = new Set([
  // Current routes
  "admin",
  "api",
  "app",
  "dashboard",
  "docs",
  "faq",
  "integrations",
  "login",
  "logout",
  "onboarding",
  "pricing",
  "privacy",
  "settings",
  "signup",
  "terms",
  // `tools` parents the free converter routes (/tools/markdown-to-pdf
  // etc.). Reserved at the namespace level so a user can never claim
  // a workspace slug that would collide with a future tool, even if
  // we add `/tools/foo` after launch — the workspace slug check
  // catches it before the route does.
  "tools",
  // Same reasoning for the new SEO-focused namespaces. Each parents
  // a growing set of marketing / use-case pages (`/use-cases/*`,
  // `/compare/*`, `/templates`). Reserving the parents keeps the
  // route space clean as we add more pages without retroactively
  // colliding with any existing workspace.
  "use-cases",
  "compare",
  "templates",
  "refund-policy",
  // Agent-first routes: /claim/<token> keeps anonymous docs, /a/<id>
  // serves them (too short to be a slug anyway), /skill.md and
  // /openapi.json are agent entry points.
  "claim",
  // /try redirects to the publish tool (next.config.ts), the short link
  // for launch posts.
  "try",
  "skill",
  "openapi",
  "forgot-password",
  "reset-password",
  // /mcp is the MCP server setup page; /connect is kept for connecting
  // apps (OAuth consent and the like).
  "mcp",
  "connect",
  // /extension is the browser extension's page (and /extension/uninstalled).
  "extension",
  "extensions",
  // Future-proofing: pages and features
  "about",
  "account",
  "billing",
  "blog",
  "careers",
  "changelog",
  "community",
  "compare",
  "contact",
  "cookies",
  "customers",
  "demo",
  "download",
  "enterprise",
  "explore",
  "features",
  "feedback",
  "getting-started",
  "guides",
  "help",
  "home",
  "import",
  "invite",
  "jobs",
  "legal",
  "marketplace",
  "new",
  "newsletter",
  "notifications",
  "partners",
  "plans",
  "press",
  "profile",
  "public",
  "referral",
  "register",
  "roadmap",
  "search",
  "security",
  "sitemap",
  "start",
  "status",
  "subscribe",
  "support",
  "team",
  "teams",
  "templates",
  "trending",
  "trust",
  "updates",
  "upgrade",
  "verify",
  "welcome",
  "workspace",
  "workspaces",
  // Brand and system
  "opendocs",
  "openclaw",
  "official",
  "staff",
  "moderator",
  "system",
  "root",
  "null",
  "undefined",
  "anonymous",
  "unknown",
  "deleted",
  "suspended",
  // Common well-known paths
  "auth",
  "callback",
  "cdn",
  "feed",
  "graphql",
  "health",
  "healthz",
  "hooks",
  "internal",
  "oauth",
  "rss",
  "static",
  "webhook",
  "webhooks",
  "well-known",
  "www",
]);

// Backwards-compatible alias — existing code that imports RESERVED_USERNAMES
// still compiles without changes. New code should use RESERVED_SLUGS directly.
export const RESERVED_USERNAMES = RESERVED_SLUGS;

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}
