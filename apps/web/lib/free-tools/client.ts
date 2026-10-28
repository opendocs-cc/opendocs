"use client";

import { useCallback, useEffect, useRef } from "react";

import { FREE_TOOL_LIMITS, type FreeToolSlug } from "@opendocs/shared/config/free-tools";
import { API_BASE_URL } from "@/lib/config/api";

/**
 * Browser helpers shared by the free tools (/tools/*): the converter request,
 * the bot-check fields, size checks and the hand-off of a draft from a
 * converter to the publish tool. Limits come from FREE_TOOL_LIMITS so the
 * pages and the API agree.
 */

export type ConvertFormat = "pdf" | "docx";

export const CONVERTER_MAX_BYTES = FREE_TOOL_LIMITS.converter.maxBytes;
export const ANONYMOUS_MAX_BYTES = FREE_TOOL_LIMITS.anonymousPublish.maxBytes;

const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

export function byteLength(text: string): number {
  return encoder ? encoder.encode(text).length : text.length;
}

/**
 * Sizes for the counters next to the text boxes. `kilo` matches how the
 * limit is written: the converter's 2 MB is 2 x 1024 x 1024 bytes, the
 * anonymous 512 KB is 512,000 bytes.
 */
export function formatBytes(bytes: number, kilo: 1000 | 1024 = 1024): string {
  if (bytes < kilo) return `${bytes} B`;
  if (bytes < kilo * kilo) return `${(bytes / kilo).toFixed(bytes < 10 * kilo ? 1 : 0)} KB`;
  return `${(bytes / (kilo * kilo)).toFixed(1)} MB`;
}

/** "Quarterly report" from "# Quarterly report", as a safe file name. */
export function filenameFromMarkdown(markdown: string, fallback: string): string {
  const heading = /^\s{0,3}#{1,2}\s+(.+?)\s*#*\s*$/m.exec(markdown)?.[1] ?? "";
  const base = heading
    .replace(/[`*_~[\]()<>]/g, "")
    .replace(/[^\p{L}\p{N}\s.-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60)
    .replace(/[-.]+$/, "");
  return base || fallback;
}

export class FreeToolError extends Error {
  constructor(
    message: string,
    public readonly status: number | "network",
  ) {
    super(message);
  }
}

/** Reads `{ message }` from an API error, or falls back to `fallback`. */
export async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const payload = (await res.json()) as { message?: string };
    if (payload?.message) return payload.message;
  } catch {
    // Not JSON; keep the fallback.
  }
  return fallback;
}

/**
 * The honeypot and time-to-submit fields (see apps/api/src/middleware/bot-check.ts).
 * Render `<HoneypotField>` with `honeypotProps` inside the form and spread
 * `botFields()` into the request.
 */
export function useBotCheck() {
  const shownAt = useRef<number | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  const botFields = useCallback((): Record<string, string | number> => {
    const { honeypotField, elapsedField } = FREE_TOOL_LIMITS.botCheck;
    return {
      [honeypotField]: honeypot.current?.value ?? "",
      [elapsedField]: shownAt.current === null ? 0 : Date.now() - shownAt.current,
    };
  }, []);

  return { honeypotRef: honeypot, botFields };
}

/**
 * POSTs Markdown to the free converter and returns the file. Pasted text
 * goes up as a `.md` file, the same as an upload, so both share the 2 MB
 * limit and every server-side check.
 */
export async function convertMarkdown(input: {
  format: ConvertFormat;
  tool: FreeToolSlug;
  file?: File;
  text?: string;
  /** Without extension, for pasted text. */
  filename?: string;
  botFields: Record<string, string | number>;
}): Promise<{ blob: Blob; filename: string }> {
  const body = new FormData();
  const file =
    input.file ??
    new File([input.text ?? ""], `${input.filename ?? "document"}.md`, { type: "text/markdown" });
  body.append("file", file);
  body.append("tool", input.tool);
  for (const [key, value] of Object.entries(input.botFields)) body.append(key, String(value));

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/v1/tools/convert/${input.format}`, { method: "POST", body });
  } catch {
    throw new FreeToolError("We couldn't reach the converter. Check your connection and try again.", "network");
  }
  if (!res.ok) {
    // The API's messages for limits, sizes and busy periods are written for
    // people, so show them as they are.
    throw new FreeToolError(await apiErrorMessage(res, "Something went wrong converting your Markdown."), res.status);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const base = file.name.replace(/\.(md|markdown)$/i, "") || "document";
  return { blob, filename: match?.[1] ?? `${base}.${input.format}` };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some browsers start the download after this tick.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A converter page's "Publish it as a link" carries the text over to the
// publish tool in sessionStorage (this tab only, never in the URL).
const DRAFT_KEY = "opendocs:publish-draft";

export function saveDraftForPublish(markdown: string): boolean {
  if (!markdown.trim() || byteLength(markdown) > ANONYMOUS_MAX_BYTES) return false;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, markdown);
    return true;
  } catch {
    return false;
  }
}

export function takeDraftForPublish(): string | null {
  try {
    const draft = window.sessionStorage.getItem(DRAFT_KEY);
    if (draft !== null) window.sessionStorage.removeItem(DRAFT_KEY);
    return draft;
  } catch {
    return null;
  }
}
