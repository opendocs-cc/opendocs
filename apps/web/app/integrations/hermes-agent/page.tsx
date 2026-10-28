import type { Metadata } from "next";

import { IntegrationPage } from "@/components/marketing/integration-page";
import { getIntegration } from "@/lib/integrations";
import { buildPageMetadata } from "@/lib/metadata";

const integration = getIntegration("hermes-agent");

export const metadata: Metadata = buildPageMetadata({
  title: "Publish Markdown from Hermes Agent",
  description: integration.metaDescription,
  url: "https://opendocs.cc/integrations/hermes-agent",
});

export default function HermesAgentPage() {
  return <IntegrationPage integration={integration} />;
}
