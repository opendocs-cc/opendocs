/**
 * Client for the doc-converter microservice (the `converter` service in
 * deploy/docker-compose.yml, reached over the private network via
 * DOC_CONVERTER_URL).
 *
 * The service exposes POST /convert/docx and POST /convert/pdf — both return
 * the rendered binary with Content-Disposition: attachment.
 */

import { stripPrivateBlocks } from "@opendocs/shared/markdown/private-blocks";

export type ConvertFormat = "docx" | "pdf";

export interface ConvertBody {
  markdown: string;
  filename?: string;
  landscape?: boolean;
  accent_color?: string;
  branding?: Record<string, unknown>;
  /** Put DocuSeal field tags in ```signature blocks (for signing). */
  signature_fields?: boolean;
}

export interface ConvertResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/**
 * The converter only uses `filename` for its Content-Disposition header,
 * which must be Latin-1: a title like "Contract — 26 October" made it fail
 * every PDF/Word render (Drive saves and signature drafts pass the title).
 * Send an ASCII version; callers name the file they store or serve
 * themselves.
 */
export function asciiFilename(name: string): string {
  const ascii = name
    .replace(/[ðÐþÞæÆøØß]/g, (c) => ({ ð: "d", Ð: "D", þ: "th", Þ: "Th", æ: "ae", Æ: "Ae", ø: "o", Ø: "O", ß: "ss" })[c]!)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7e]+/g, "")
    .replace(/["\\/:*?<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return ascii.slice(0, 120) || "document";
}

/** An attachment header that keeps any filename (ASCII fallback + RFC 5987). */
export function attachmentHeader(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]+/g, "-").replace(/["\\]/g, "");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function getConverterBaseUrl(): string {
  const url = process.env.DOC_CONVERTER_URL;
  if (!url) throw new Error("DOC_CONVERTER_URL is not set");
  return url.replace(/\/$/, "");
}

export async function convertMarkdown(
  format: ConvertFormat,
  body: ConvertBody,
): Promise<ConvertResult> {
  const baseUrl = getConverterBaseUrl();
  const controller = new AbortController();
  // A PDF takes well under a second to convert, but during a burst requests
  // queue for the converter's workers (one per CPU), so allow for waiting
  // our turn. 55s stays under the CLI's 60s request timeout; the converter
  // stops a hung LibreOffice on its own after 60s.
  const timeoutId = setTimeout(() => controller.abort(), 55_000);

  try {
    const res = await fetch(`${baseUrl}/convert/${format}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ```private blocks are the author's notes: hidden on the web, so
      // they must not reach a PDF or Word file either.
      body: JSON.stringify({
        ...body,
        ...(body.filename !== undefined ? { filename: asciiFilename(body.filename) } : {}),
        markdown: stripPrivateBlocks(body.markdown),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`converter responded ${res.status}: ${text.slice(0, 200)}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType =
      res.headers.get("content-type") ?? "application/octet-stream";
    const disp = res.headers.get("content-disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disp);
    const filename = match?.[1] ?? `${body.filename ?? "document"}.${format}`;
    return { buffer, filename, contentType };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * The response for a failed `convertMarkdown` call, or `null` when `err`
 * isn't a converter failure. Shared by every route that renders a file
 * (exports, Drive saves, signature drafts) so they all answer 502/504.
 */
export function converterFailure(
  err: unknown,
): { status: 502 | 504; body: { error: string; message: string } } | null {
  if (!(err instanceof Error)) return null;
  if (err.message.startsWith("converter responded")) {
    return { status: 502, body: { error: "export_failed", message: "Document converter failed." } };
  }
  if (err.name === "AbortError") {
    return { status: 504, body: { error: "export_timeout", message: "Converter timed out" } };
  }
  return null;
}
