import type { NextFunction, Request, Response } from "express";

import type { ClientAwareRequest } from "../types";

const CLIENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}(\/[a-z0-9][a-z0-9._-]{0,30})?$/;

/**
 * Normalizes `X-OpenDocs-Client: <harness>[/<detail>]` (e.g. `claude-code`,
 * `cursor/finance-bot`) so publishes can record which agent made them.
 * Anything malformed is ignored rather than rejected.
 */
export function parseClientHeader(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return CLIENT_PATTERN.test(normalized) ? normalized : null;
}

export function clientAttribution(req: Request, _res: Response, next: NextFunction) {
  (req as ClientAwareRequest).openDocsClient = parseClientHeader(req.header("x-opendocs-client"));
  next();
}

export function readClient(req: Request): string | null {
  return (req as ClientAwareRequest).openDocsClient ?? null;
}
