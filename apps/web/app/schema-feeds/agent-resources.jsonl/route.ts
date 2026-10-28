import { agentResourcesJsonl, discoveryResponse } from "@/lib/agent-discovery";

export const dynamic = "force-static";

export function GET() {
  return discoveryResponse(agentResourcesJsonl(), "application/jsonl; charset=utf-8");
}
