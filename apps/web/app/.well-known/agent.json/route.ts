import { agentManifest, discoveryResponse } from "@/lib/agent-discovery";

export const dynamic = "force-static";

export function GET() {
  return discoveryResponse(agentManifest());
}
