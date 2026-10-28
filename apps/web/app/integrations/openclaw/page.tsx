import type { Metadata } from "next";

import { IntegrationPage } from "@/components/marketing/integration-page";
import { getIntegration } from "@/lib/integrations";
import { buildPageMetadata } from "@/lib/metadata";

const integration = getIntegration("openclaw");

export const metadata: Metadata = buildPageMetadata({
  title: "Publish Markdown from OpenClaw",
  description: integration.metaDescription,
  url: "https://opendocs.cc/integrations/openclaw",
});

export default function OpenclawPage() {
  return <IntegrationPage integration={integration} />;
}
