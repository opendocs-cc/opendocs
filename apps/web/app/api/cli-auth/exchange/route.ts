import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  CliAuthError,
  exchangeCliLoginCode,
} from "@opendocs/shared/cli-auth/service";

export const dynamic = "force-dynamic";

const exchangeSchema = z.object({
  code: z.string().min(32).max(256),
  codeVerifier: z.string().min(32).max(256),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = exchangeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", message: "Invalid CLI code exchange request." },
        { status: 400 },
      );
    }

    const result = await exchangeCliLoginCode(parsed.data);
    return NextResponse.json(result);
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
