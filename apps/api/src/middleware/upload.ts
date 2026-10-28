import type { NextFunction, Request, RequestHandler, Response } from "express";
import multer from "multer";

/** Thrown from a multer `fileFilter` to reject a file by its type. */
export class UnsupportedFileTypeError extends Error {}

/**
 * `upload.single(field)` with multer's errors answered as JSON. Multer
 * reports them through `next(err)` before the route handler runs, so a
 * try/catch in the handler never sees them and they'd become a 500.
 */
export function singleFileUpload(
  upload: multer.Multer,
  field: string,
  messages: { tooLarge: string },
): RequestHandler {
  const handler = upload.single(field);
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (err?: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof UnsupportedFileTypeError) {
        res.status(400).json({ error: "unsupported_mime", message: err.message });
        return;
      }
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "file_too_large", message: messages.tooLarge });
          return;
        }
        res.status(400).json({
          error: "invalid_request",
          message: `${err.message}. Send one file in the "${field}" field.`,
        });
        return;
      }
      next(err);
    });
  };
}
