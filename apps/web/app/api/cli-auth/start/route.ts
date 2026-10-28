import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  CliAuthError,
  createCliLoginRequest,
} from "@opendocs/shared/cli-auth/service";
import { siteConfig } from "@opendocs/shared/config/site";

export const dynamic = "force-dynamic";

const startSchema = z.object({
  state: z.string().min(32).max(256),
  codeChallenge: z.string().min(32).max(256),
  redirectUri: z.string().url(),
  apiUrl: z.string().url(),
  clientName: z.string().max(100).optional(),
});

function getAuthorizeOrigin(req: NextRequest): string {
  const hostname = req.nextUrl.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return req.nextUrl.origin;
  }
  return process.env.OPENDOCS_PUBLIC_WEB_URL ?? process.env.WEB_APP_URL ?? siteConfig.url;
}

export async function POST(req: NextRequest) {
  try {
    const parsed = startSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", message: "Invalid CLI login request." },
        { status: 400 },
      );
    }

    const request = await createCliLoginRequest(parsed.data);
    const authorizeUrl = new URL("/cli/login", getAuthorizeOrigin(req));
    authorizeUrl.searchParams.set("request", request.id);
    authorizeUrl.searchParams.set("state", parsed.data.state);

    return NextResponse.json({
      requestId: request.id,
      authorizeUrl: authorizeUrl.toString(),
      expiresAt: request.expiresAt,
    });
  } catch (err) {
    if (err instanceof CliAuthError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: 400 },
      );
    }
    throw err;
  }
}
