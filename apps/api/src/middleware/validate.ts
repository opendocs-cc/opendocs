import type { Request, Response, NextFunction } from "express";
import type { ZodError, ZodType } from "zod";

/**
 * One readable sentence from a Zod error, e.g.
 * "confirmPublic: Public publishing requires explicit confirmation."
 * Agents read `message`; `issues` stays for clients that want every field.
 */
export function summarizeZodError(error: ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

export function invalidRequestBody(error: ZodError) {
  return {
    error: "invalid_request",
    message: summarizeZodError(error),
    issues: error.flatten(),
  };
}

export function validateBody(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json(invalidRequestBody(parsed.error));
      return;
    }

    req.body = parsed.data;
    next();
  };
}

export function validateQuery(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json(invalidRequestBody(parsed.error));
      return;
    }

    (req as unknown as Record<string, unknown>).validatedQuery = parsed.data;
    next();
  };
}
