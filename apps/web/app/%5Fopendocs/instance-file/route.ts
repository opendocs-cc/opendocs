import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { withInstanceUrls } from "@opendocs/shared/config/instance";

import { INSTANCE_FILE_HEADER, INSTANCE_FILES } from "@/lib/instance-files";

export const dynamic = "force-dynamic";

/**
 * The agent files in public/ (skill.md, llms.txt, install.sh, …) with a
 * self-hosted instance's addresses instead of opendocs.cc's. The middleware
 * rewrites those paths here, and only off opendocs.cc; there they're served
 * as the static files they are.
 */
export async function GET(request: NextRequest) {
  const file = request.headers.get(INSTANCE_FILE_HEADER) ?? "";
  const contentType = INSTANCE_FILES[file];
  if (!contentType) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // The web app runs from apps/web, in development and in the standalone build.
  const body = await readFile(path.join(process.cwd(), "public", file), "utf8");
  return new Response(withInstanceUrls(body), {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=300" },
  });
}
