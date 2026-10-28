import type { NextFunction, Request, Response } from "express";

export const ERRORS_DOCS_URL = "https://docs.opendocs.cc/errors";

export function docsUrlFor(code: string) {
  return `${ERRORS_DOCS_URL}#${code.replace(/_/g, "-")}`;
}

const DEFAULT_MESSAGES: Record<string, string> = {
  unauthorized:
    "Missing or invalid credentials. Sign in with `opendocs login --email <you@example.com>` or pass an API key.",
  forbidden: "You don't have permission to do that.",
  not_found: "Not found.",
  rate_limited: "Too many requests. Try again later.",
};

/**
 * Gives every JSON error response the same shape: `error` (stable code),
 * `message` (human/agent readable) and `docs_url` (where the code is
 * explained). Routes keep returning `{ error }` or `{ error, message }`;
 * this fills in what's missing so clients never have to guess.
 */
export function errorShape(_req: Request, res: Response, next: NextFunction) {
  const json = res.json.bind(res);
  res.json = (body?: unknown) => {
    if (
      res.statusCode >= 400 &&
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      typeof (body as { error?: unknown }).error === "string"
    ) {
      const record = body as Record<string, unknown> & { error: string };
      return json({
        ...record,
        message:
          typeof record.message === "string" && record.message.length > 0
            ? record.message
            : (DEFAULT_MESSAGES[record.error] ?? record.error.replace(/_/g, " ")),
        docs_url: record.docs_url ?? docsUrlFor(record.error),
      });
    }
    return json(body);
  };
  next();
}
