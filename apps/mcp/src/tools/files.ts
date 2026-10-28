import { z } from "zod";

import { UserFacingError } from "../lib/errors";
import { ok } from "../lib/result";
import { defineTool, READ_ONLY, WRITE } from "./types";

type DownloadLink = { url: string; filename: string; expiresAt: string };

export const exportDocument = defineTool({
  name: "export_document",
  title: "Export as PDF or Word",
  description:
    "Turn one or more documents (up to 10) into PDF or Word files with the workspace's branding, and get a download link for each. Links work for an hour; give them to the user as links, one per line. Word (docx) isn't available in every workspace; if it's refused, offer PDF instead. Depending on the workspace, PDFs can carry a small \"Made with OpenDocs\" footer.",
  scope: "docs:read",
  annotations: READ_ONLY,
  input: z.object({
    documents: z.array(z.string().min(1)).min(1).max(10).describe("Links, slugs or IDs."),
    format: z.enum(["pdf", "docx"]).default("pdf"),
    landscape: z.boolean().optional(),
    accent_color: z
      .string()
      .regex(/^#?[0-9A-Fa-f]{6}$/)
      .optional()
      .describe("Optional accent colour for this export only, like #1B3A6B."),
  }),
  async run(args, ctx) {
    const links: Array<{ document: string } & (DownloadLink | { error: string })> = [];
    for (const document of args.documents) {
      const target = await ctx.resolveDocument(document);
      try {
        const link = await ctx.api.post<DownloadLink>("/download-links", {
          kind: "post_export",
          document: target.ref,
          ...(target.workspaceId ? { workspaceId: target.workspaceId } : {}),
          ...(target.projectId ? { projectId: target.projectId } : {}),
          format: args.format,
          ...(args.landscape !== undefined ? { landscape: args.landscape } : {}),
          ...(args.accent_color ? { accent_color: args.accent_color } : {}),
        });
        links.push({ document, ...link });
      } catch (err) {
        if (args.documents.length === 1) throw err;
        links.push({ document, error: err instanceof Error ? err.message : "Export failed." });
      }
    }
    const lines = [
      `${args.format === "pdf" ? "PDF" : "Word"} download link${links.length === 1 ? "" : "s"} (valid for an hour; the file is made when the link is opened):`,
    ];
    for (const link of links) {
      if ("url" in link) lines.push(`${link.filename}\n${link.url}`);
      else lines.push(`${link.document}: ${link.error}`);
    }
    return ok(lines.join("\n"), {
      format: args.format,
      files: links,
      note: "Each link works for an hour; the file is made when the link is opened. Give the user each link on its own line.",
    });
  },
});

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};
// Where ChatGPT serves files the user attached (passed to us as a
// temporary download_url). Anything else isn't fetched.
const CHATGPT_FILE_HOSTS = [/(^|\.)oaiusercontent\.com$/, /(^|\.)openai\.com$/, /(^|\.)chatgpt\.com$/];

/** The image type from the bytes themselves; declared types aren't trusted. */
function sniffType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  const head = new TextDecoder().decode(bytes.slice(0, 1024)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

function allowedFileUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && CHATGPT_FILE_HOSTS.some((re) => re.test(url.hostname)) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Downloads a file ChatGPT attached, following at most three redirects and
 * only to allowed https hosts, and never reading more than the size cap.
 */
async function fetchAttachedFile(start: URL): Promise<Uint8Array> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      const target = next ? allowedFileUrl(new URL(next, url).toString()) : null;
      if (!target) throw new UserFacingError("Couldn't download the attached file. Ask the user to attach it again.");
      url = target;
      continue;
    }
    if (!res.ok || !res.body) {
      throw new UserFacingError("Couldn't download the attached file. Ask the user to attach it again.");
    }
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_IMAGE_BYTES) throw new UserFacingError("The image is larger than 10 MB.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength;
      if (total > MAX_IMAGE_BYTES) throw new UserFacingError("The image is larger than 10 MB.");
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
  throw new UserFacingError("Couldn't download the attached file. Ask the user to attach it again.");
}

export const uploadImage = defineTool({
  name: "upload_image",
  title: "Upload an image",
  description:
    "Store an image in OpenDocs and get a permanent link to put in a document as ![description](link). Pass the image as base64 (data_base64), or as a file the user attached in ChatGPT (file). Images that already have a public https link don't need this: put the link straight into the Markdown and OpenDocs copies it when you publish. PNG, JPEG, WebP, GIF or SVG, up to 10 MB.",
  scope: "docs:write",
  annotations: WRITE,
  meta: { "openai/fileParams": ["file"] },
  input: z.object({
    data_base64: z.string().optional().describe("The image bytes, base64-encoded."),
    file: z
      .object({
        download_url: z.string(),
        file_id: z.string(),
        mime_type: z.string().optional(),
        file_name: z.string().optional(),
      })
      .optional()
      .describe("A file the user attached in ChatGPT."),
    filename: z.string().max(120).optional(),
    workspace: z.string().optional(),
  }),
  async run(args, ctx) {
    let bytes: Uint8Array;
    let filename = args.filename ?? args.file?.file_name ?? "image";
    if (args.data_base64) {
      const cleaned = args.data_base64.replace(/^data:[^;]+;base64,/, "");
      if (cleaned.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4) {
        throw new UserFacingError("The image is larger than 10 MB.");
      }
      bytes = new Uint8Array(Buffer.from(cleaned, "base64"));
    } else if (args.file) {
      const url = allowedFileUrl(args.file.download_url);
      if (!url) {
        throw new UserFacingError("Only files attached in ChatGPT can be fetched this way. Pass data_base64 instead.");
      }
      bytes = await fetchAttachedFile(url);
    } else {
      throw new UserFacingError(
        "Pass data_base64 or file. For an image that already has a public link, put the link straight into the Markdown.",
      );
    }
    if (bytes.byteLength === 0) throw new UserFacingError("The image is empty.");
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new UserFacingError("The image is larger than 10 MB.");
    const contentType = sniffType(bytes);
    if (!contentType) throw new UserFacingError("That isn't a PNG, JPEG, WebP, GIF or SVG image.");
    if (!/\.[a-z0-9]+$/i.test(filename)) filename = `${filename}.${IMAGE_TYPES[contentType]}`;

    const workspace = await ctx.resolveWorkspace(args.workspace);
    const presign = await ctx.api.post<{ uploadUrl: string; publicUrl: string }>("/storage/images/presign-upload", {
      workspaceId: workspace.id,
      contentType,
      contentLength: bytes.byteLength,
      filename,
    });
    const put = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType, "Content-Length": String(bytes.byteLength) },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(60_000),
    });
    if (!put.ok) throw new UserFacingError("The upload to storage failed. Try again in a moment.", "image_upload_failed");
    const markdown = `![${filename.replace(/\.[a-z0-9]+$/i, "")}](${presign.publicUrl})`;
    return ok(`Uploaded. Use it in the document as:\n${markdown}`, {
      url: presign.publicUrl,
      markdown,
      contentType,
      bytes: bytes.byteLength,
    });
  },
});
