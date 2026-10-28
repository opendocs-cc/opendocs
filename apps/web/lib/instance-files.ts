/**
 * Agent files in public/ that mention opendocs.cc's addresses. A
 * self-hosted instance serves them through app/%5Fopendocs/instance-file
 * with its own addresses instead.
 */
export const INSTANCE_FILES: Record<string, string> = {
  "/skill.md": "text/markdown; charset=utf-8",
  "/llms.txt": "text/plain; charset=utf-8",
  "/install.sh": "text/x-shellscript; charset=utf-8",
  "/openapi.json": "application/json; charset=utf-8",
  "/.well-known/agent-skills/opendocs/SKILL.md": "text/markdown; charset=utf-8",
  "/.well-known/agent-skills/opendocs/scripts/opendocs.sh": "text/x-shellscript; charset=utf-8",
};

/** Request header naming the file, set by the middleware. */
export const INSTANCE_FILE_HEADER = "x-opendocs-instance-file";

/**
 * Pages that are opendocs.cc's public website: the marketing pages, the
 * free tools, pricing and the legal pages. A self-hosted instance
 * (SELF_HOSTED=true) is an app for one team, so they send people to the
 * dashboard instead. Anonymous documents (/a, /claim) are off there too.
 */
export const PUBLIC_SITE_PATHS = [
  "/pricing",
  "/pricing.md",
  "/faq",
  "/tools",
  "/try",
  "/use-cases",
  "/integrations",
  "/compare",
  "/extension",
  "/mcp",
  "/terms",
  "/privacy",
  "/refund-policy",
  "/a",
  "/claim",
];

export function isPublicSitePath(pathname: string): boolean {
  return pathname === "/" || PUBLIC_SITE_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
