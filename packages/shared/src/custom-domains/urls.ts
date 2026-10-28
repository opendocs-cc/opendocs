import { instanceWebUrl } from "../config/instance";

/**
 * URL helpers for custom domains. Pure functions, shared by the API
 * (`publicUrl`), the web app (links, redirects, canonical URLs) and tests.
 */

/**
 * The OpenDocs web app's own origin, e.g. https://opendocs.cc. Same
 * fallback chain as share emails, so local development links to the local
 * app instead of production.
 */
export function openDocsWebUrl(): string {
  return instanceWebUrl();
}

/**
 * The origin a custom domain is served on. Always HTTPS, except dev test
 * domains like notes.localhost, which use plain HTTP on the web app's port
 * (http://notes.localhost:3000) so they work without certificates.
 */
export function customDomainOrigin(hostname: string): string {
  if (process.env.NODE_ENV !== "production" && hostname.endsWith(".localhost")) {
    let port = "";
    try {
      port = new URL(openDocsWebUrl()).port;
    } catch {
      port = "";
    }
    return `http://${hostname}${port ? `:${port}` : ""}`;
  }
  return `https://${hostname}`;
}

/**
 * Maps a workspace path on opendocs.cc to the same page on the workspace's
 * custom domain: `/acme` → `/`, `/acme/plan` → `/plan`,
 * `/acme/projects/launch?sort=x` → `/projects/launch?sort=x`. Paths outside
 * the workspace are returned unchanged.
 */
export function stripWorkspacePrefix(workspaceSlug: string, path: string): string | null {
  const prefix = `/${workspaceSlug}`;
  if (path === prefix) return "/";
  const next = path.charAt(prefix.length);
  if (path.startsWith(prefix) && (next === "/" || next === "?" || next === "#")) {
    const rest = path.slice(prefix.length);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return null;
}

/**
 * Paths on a custom domain that belong to OpenDocs, not to the workspace:
 * the web middleware sends them to opendocs.cc (the dashboard, sign-in…)
 * or answers them itself (/healthz). A default-project document whose slug
 * is one of these (a doc titled "Onboarding") can't be served on the
 * custom domain, so its links, redirects and sitemap entry stay on
 * opendocs.cc (isServedOnCustomDomain).
 */
export const CUSTOM_DOMAIN_APP_PATHS = [
  "/dashboard",
  "/login",
  "/signup",
  "/onboarding",
  "/forgot-password",
  "/reset-password",
  "/invite",
  "/cli",
  "/oauth",
  "/claim",
  "/auth",
  "/account-deleted",
] as const;

export function isCustomDomainAppPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  return CUSTOM_DOMAIN_APP_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Whether a workspace page (by its opendocs.cc path, `/acme/plan`) can be
 * served on the workspace's custom domain.
 */
export function isServedOnCustomDomain(workspaceSlug: string, path: string): boolean {
  const stripped = stripWorkspacePrefix(workspaceSlug, path);
  if (stripped === null) return false;
  return stripped !== "/healthz" && !isCustomDomainAppPath(stripped);
}

/**
 * The reverse of stripWorkspacePrefix: a path on the custom domain to the
 * route it renders (`/` → `/acme`, `/plan` → `/acme/plan`).
 */
export function workspaceRoutePath(workspaceSlug: string, customPath: string): string {
  return customPath === "/" || customPath === "" ? `/${workspaceSlug}` : `/${workspaceSlug}${customPath}`;
}

/**
 * Absolute URL of a workspace page on its custom domain, from its
 * opendocs.cc path (`/acme/plan`).
 */
export function customDomainUrl(hostname: string, workspaceSlug: string, path: string): string {
  const stripped = stripWorkspacePrefix(workspaceSlug, path) ?? path;
  const origin = customDomainOrigin(hostname);
  return stripped === "/" ? origin : `${origin}${stripped}`;
}

/**
 * A safe path to send someone back to after signing in: relative to the
 * current host, no scheme, no protocol-relative `//` or backslash tricks,
 * no control characters. Returns null for anything else.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2048) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  // Browsers treat "/\evil.com" like "//evil.com"; reject backslashes,
  // and control characters (tabs and newlines are stripped by URL parsers).
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const base = "https://return-path.invalid";
    const parsed = new URL(raw, base);
    if (parsed.origin !== base) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
