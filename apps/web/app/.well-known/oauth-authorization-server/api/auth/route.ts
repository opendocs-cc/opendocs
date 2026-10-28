import { authorizationServerMetadata } from "@/lib/auth/oauth-metadata";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return authorizationServerMetadata(request);
}
