import type { Metadata } from "next";

import { IntegrationPage } from "@/components/marketing/integration-page";
import { getIntegration } from "@/lib/integrations";
import { buildPageMetadata } from "@/lib/metadata";

const integration = getIntegration("aider");

export const metadata: Metadata = buildPageMetadata({
  title: "Publish Markdown from Aider",
  description: integration.metaDescription,
  url: "https://opendocs.cc/integrations/aider",
});

export default function AiderPage() {
  return <IntegrationPage integration={integration} />;
}
