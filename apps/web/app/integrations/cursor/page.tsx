import type { Metadata } from "next";

import { IntegrationPage } from "@/components/marketing/integration-page";
import { getIntegration } from "@/lib/integrations";
import { buildPageMetadata } from "@/lib/metadata";

const integration = getIntegration("cursor");

export const metadata: Metadata = buildPageMetadata({
  title: "Publish Markdown from Cursor",
  description: integration.metaDescription,
  url: "https://opendocs.cc/integrations/cursor",
});

export default function CursorPage() {
  return <IntegrationPage integration={integration} />;
}
