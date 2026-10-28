import type { Request, Response, NextFunction } from "express";

/**
 * body-parser tags its errors with a `type` (and `status`). Express 5 hands
 * them straight to this handler, so map the ones a client caused to a 4xx
 * instead of a 500.
 */
function clientBodyError(err: Error): { status: number; error: string; message: string } | null {
  const type = (err as { type?: unknown }).type;
  if (type === "entity.too.large") {
    return {
      status: 413,
      error: "payload_too_large",
      message: "The request body is too large. Send a smaller document, or split a batch into several requests.",
    };
  }
  if (type === "entity.parse.failed") {
    return {
      status: 400,
      error: "invalid_request",
      message: "The request body isn't valid JSON.",
    };
  }
  return null;
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const clientError = clientBodyError(err);
  if (clientError) {
    const { status, ...body } = clientError;
    res.status(status).json(body);
    return;
  }

  console.error("[API Error]", err.message);

  res.status(500).json({
    error: "internal_error",
    message: process.env.NODE_ENV === "production"
      ? "An unexpected error occurred."
      : err.message,
  });
}
