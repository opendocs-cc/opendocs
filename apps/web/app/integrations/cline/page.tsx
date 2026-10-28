import type { Metadata } from "next";

import { IntegrationPage } from "@/components/marketing/integration-page";
import { getIntegration } from "@/lib/integrations";
import { buildPageMetadata } from "@/lib/metadata";

const integration = getIntegration("cline");

export const metadata: Metadata = buildPageMetadata({
  title: "Publish Markdown from Cline",
  description: integration.metaDescription,
  url: "https://opendocs.cc/integrations/cline",
});

export default function ClinePage() {
  return <IntegrationPage integration={integration} />;
}
