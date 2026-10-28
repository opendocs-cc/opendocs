import { Router } from "express";
import multer from "multer";

import { FREE_TOOL_LIMITS, freeToolSlug } from "@opendocs/shared/config/free-tools";
import { convertMarkdown } from "../lib/converter";
import { publicBranding } from "../lib/public-branding";
import { rejectBotSubmissions } from "../middleware/bot-check";
import { singleFileUpload, UnsupportedFileTypeError } from "../middleware/upload";
import {
  publicConvertBurstRateLimit,
  publicConvertDailyRateLimit,
  publicConvertGlobalHourlyLimit,
  publicConvertGlobalMinuteLimit,
  publicConvertHourlyRateLimit,
} from "../middleware/rate-limit";

const router = Router();

// 2 MB, for an uploaded file and for pasted text alike (the tool pages send
// pasted text as a .md file). Markdown files are text and almost never
// approach this; anything bigger is suspicious (or has embedded base64
// images that should be hosted separately anyway). The converter has its own
// input limits too; this is just the front line.
const MAX_FILE_BYTES = FREE_TOOL_LIMITS.converter.maxBytes;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    // Accept by extension OR by mimetype — browsers don't agree on a
    // canonical Markdown mimetype (text/markdown, text/x-markdown,
    // text/plain are all in the wild) so being lenient here is the
    // less surprising choice.
    const okExtension = /\.md$|\.markdown$/i.test(file.originalname);
    const okMime =
      file.mimetype === "text/markdown" ||
      file.mimetype === "text/x-markdown" ||
      file.mimetype === "text/plain" ||
      file.mimetype === "application/octet-stream";
    if (okExtension || okMime) {
      cb(null, true);
      return;
    }
    cb(new UnsupportedFileTypeError("Only .md / .markdown files are accepted."));
  },
});

/**
 * Strip a trailing `.md` / `.markdown` so the converter's
 * `Content-Disposition` filename ends up like `report.pdf` rather
 * than `report.md.pdf`. The converter normally gets a clean basename
 * from authenticated callers; here we sanitise once at the edge.
 */
function deriveBasename(originalName: string): string {
  return originalName
    .replace(/\.(md|markdown)$/i, "")
    .replace(/[^\w\s.-]/g, "")
    .trim() || "document";
}

function buildHandler(format: "pdf" | "docx") {
  return async (
    req: import("express").Request,
    res: import("express").Response,
  ) => {
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({
        error: "missing_file",
        message: 'Send the Markdown as a file in the "file" field.',
      });
      return;
    }

    const markdown = file.buffer.toString("utf8");
    if (!markdown.trim()) {
      res.status(400).json({
        error: "empty_file",
        message: "The Markdown is empty. Paste or upload some text and try again.",
      });
      return;
    }

    const basename = deriveBasename(file.originalname);

    try {
      const result = await convertMarkdown(format, {
        markdown,
        filename: basename,
        ...publicBranding(freeToolSlug((req.body as Record<string, unknown> | undefined)?.tool)),
      });

      // Mirror the converter's response headers so the browser triggers
      // a download with the right filename + content type. We re-set
      // them here (rather than piping the upstream response) because
      // Express has already routed through middleware that may have
      // touched the response headers.
      res.setHeader("Content-Type", result.contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.filename}"`,
      );
      res.setHeader("Content-Length", result.buffer.length.toString());
      // Cache-Control: free converter results aren't user-specific, but
      // the same input could be uploaded by anyone — and we don't want
      // CDNs caching binary bodies they can't replay safely. Force
      // origin every time.
      res.setHeader("Cache-Control", "no-store");
      res.send(result.buffer);
    } catch (err) {
      // The converter timeout or upstream non-2xx surface here. We log
      // for ops but return a generic message so we don't leak service
      // topology to anonymous callers.
      console.error(`[tools] ${format} conversion failed:`, err);
      res.status(502).json({
        error: "conversion_failed",
        message:
          "We couldn't convert that file. It may be malformed Markdown — try simplifying it or remove embedded images.",
      });
    }
  };
}

// POST /api/v1/tools/convert/pdf
// POST /api/v1/tools/convert/docx
//
// Public, unauthenticated. Multipart: `file` (the Markdown), plus from the
// tool pages `tool` (which page, for the footer link) and the bot-check
// fields. In order:
//   1. Global breakers (30 a minute, 600 an hour across everyone; only
//      successful conversions count) so a botnet can't swamp the converter.
//   2. Per-IP caps: 5 a minute, 30 an hour, 100 a day.
//   3. Multer, after the limiters so a flooded IP doesn't even cost us a
//      buffer allocation.
//   4. The honeypot and time-to-submit check.
// Numbers and reasoning: FREE_TOOL_LIMITS in packages/shared/src/config/free-tools.ts.
const convertLimits = [
  publicConvertGlobalMinuteLimit,
  publicConvertGlobalHourlyLimit,
  publicConvertBurstRateLimit,
  publicConvertHourlyRateLimit,
  publicConvertDailyRateLimit,
];

for (const format of ["pdf", "docx"] as const) {
  router.post(
    `/tools/convert/${format}`,
    ...convertLimits,
    singleFileUpload(upload, "file", { tooLarge: "Markdown can be at most 2 MB." }),
    rejectBotSubmissions(`convert/${format}`),
    buildHandler(format),
  );
}

export default router;
