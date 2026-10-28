import type { Metadata } from "next";

import { IntegrationPage } from "@/components/marketing/integration-page";
import { getIntegration } from "@/lib/integrations";
import { buildPageMetadata } from "@/lib/metadata";

const integration = getIntegration("copilot");

export const metadata: Metadata = buildPageMetadata({
  title: "Publish Markdown from GitHub Copilot",
  description: integration.metaDescription,
  url: "https://opendocs.cc/integrations/copilot",
});

export default function CopilotPage() {
  return <IntegrationPage integration={integration} />;
}
