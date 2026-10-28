import type { Metadata } from "next";

import { IntegrationPage } from "@/components/marketing/integration-page";
import { getIntegration } from "@/lib/integrations";
import { buildPageMetadata } from "@/lib/metadata";

const integration = getIntegration("codex");

export const metadata: Metadata = buildPageMetadata({
  title: "Publish Markdown from Codex",
  description: integration.metaDescription,
  url: "https://opendocs.cc/integrations/codex",
});

export default function CodexPage() {
  return <IntegrationPage integration={integration} />;
}
