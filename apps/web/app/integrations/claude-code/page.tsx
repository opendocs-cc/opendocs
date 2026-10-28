import type { Metadata } from "next";

import { IntegrationPage } from "@/components/marketing/integration-page";
import { getIntegration } from "@/lib/integrations";
import { buildPageMetadata } from "@/lib/metadata";

const integration = getIntegration("claude-code");

export const metadata: Metadata = buildPageMetadata({
  title: "Publish Markdown from Claude Code",
  description: integration.metaDescription,
  url: "https://opendocs.cc/integrations/claude-code",
});

export default function ClaudeCodePage() {
  return <IntegrationPage integration={integration} />;
}
