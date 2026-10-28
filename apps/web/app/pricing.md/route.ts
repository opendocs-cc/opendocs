import { discoveryResponse, pricingMarkdown } from "@/lib/agent-discovery";

export const dynamic = "force-static";

export function GET() {
  return discoveryResponse(pricingMarkdown(), "text/markdown; charset=utf-8");
}
