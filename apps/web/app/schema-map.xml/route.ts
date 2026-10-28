import { discoveryResponse, schemaMapXml } from "@/lib/agent-discovery";

export const dynamic = "force-static";

export function GET() {
  return discoveryResponse(schemaMapXml(), "application/xml; charset=utf-8");
}
