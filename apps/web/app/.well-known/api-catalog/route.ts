import { apiCatalog, discoveryResponse } from "@/lib/agent-discovery";

export const dynamic = "force-static";

// RFC 9727 API catalog, served as a linkset.
export function GET() {
  return discoveryResponse(
    apiCatalog(),
    `application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"; charset=utf-8`,
  );
}
