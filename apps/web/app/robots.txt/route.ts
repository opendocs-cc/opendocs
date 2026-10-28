import { instanceWebUrl, isSelfHosted } from "@opendocs/shared/config/instance";

import { DISCOVERY_URLS } from "@/lib/agent-discovery";

export const dynamic = "force-static";

// Hand-written rather than robots.ts: Next's robots metadata has no room for
// Content-Signal or the Schemamap line that points agents at our discovery files.
const ROBOTS = `# OpenDocs robots.txt
# Search engines and AI agents working for people may read public pages,
# documents, docs and API metadata. Agent discovery files are listed in the
# schema map below and at ${DISCOVERY_URLS.agentJson}.

User-Agent: *
Content-Signal: search=yes, ai-input=yes
Allow: /
Disallow: /dashboard
Disallow: /onboarding
Disallow: /api
Disallow: /invite
Disallow: /oauth
Disallow: /reset-password
Disallow: /healthz

Sitemap: ${instanceWebUrl()}/sitemap.xml
Schemamap: ${DISCOVERY_URLS.schemaMap}
`;

// A self-hosted instance is one team's app: nothing to index.
const SELF_HOSTED_ROBOTS = `User-Agent: *
Disallow: /
`;

export function GET() {
  return new Response(isSelfHosted() ? SELF_HOSTED_ROBOTS : ROBOTS, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
