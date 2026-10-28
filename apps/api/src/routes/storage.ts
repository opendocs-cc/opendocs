/**
 * Storage-related HTTP endpoints.
 *
 * Right now this hosts a single presigned-upload endpoint used by the CLI
 * to push inline post images (e.g. screenshots referenced in Markdown)
 * straight to R2 without streaming them through this API. The CLI uploads
 * to the returned URL with a plain PUT, then rewrites the Markdown to
 * point at the `publicUrl` before calling /publish.
 *
 * POST /storage/images takes the bytes instead, for the browser extension:
 * it calls from its service worker, which R2's CORS rules don't (and
 * shouldn't) admit, and its images (from a chat site, behind that site's
 * login) can't be fetched by our server.
 */

import express, { Router } from "express";
import { z } from "zod";

import { getWorkspaceSettings } from "@opendocs/shared/workspaces/service";
import {
  createPresignedUploadUrl,
  storageKeys,
  uploadObject,
  extForMime,
  isImageMime,
  isStorageConfigured,
  MAX_DIRECT_IMAGE_UPLOAD_BYTES,
  StorageError,
} from "@opendocs/shared/storage/r2";

import { requireAuth } from "../auth/middleware";
import { validateBody } from "../middleware/validate";
import type { AuthenticatedRequest } from "../types";

const router = Router();

const presignSchema = z.object({
  workspaceId: z.string().min(1),
  contentType: z.string().min(1).max(128),
  contentLength: z
    .number()
    .int()
    .positive()
    .max(MAX_DIRECT_IMAGE_UPLOAD_BYTES),
  // Purely informational — we use it for logging and to preserve the
  // original extension when there's any ambiguity in contentType.
  filename: z.string().max(255).optional(),
});

// POST /api/v1/storage/images/presign-upload
// Accepts content-type, returns a short-lived presigned PUT URL plus the
// public URL the uploaded object will live at. Usable by API-key auth so
// the CLI can call it on every publish.
router.post(
  "/storage/images/presign-upload",
  requireAuth,
  validateBody(presignSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;

      if (!isStorageConfigured()) {
        res.status(503).json({ error: "storage_not_configured" });
        return;
      }

      const { workspaceId, contentType, contentLength } = req.body as z.infer<
        typeof presignSchema
      >;

      if (!isImageMime(contentType)) {
        res.status(400).json({
          error: "unsupported_mime",
          message:
            "Image content-type must be JPEG, PNG, WebP, GIF, or SVG.",
        });
        return;
      }

      // Verify the caller is an active member of the target workspace —
      // prevents uploading into a workspace the user doesn't belong to even
      // if they know/guess the id.
      const workspace = await getWorkspaceSettings(userId, workspaceId);
      if (!workspace) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      const ext = extForMime(contentType);
      const key = storageKeys.postImage(workspace.id, ext);

      const { uploadUrl, publicUrl } = await createPresignedUploadUrl({
        key,
        contentType,
        contentLength,
        expiresInSeconds: 300,
      });

      res.json({
        uploadUrl,
        publicUrl,
        key,
        expiresInSeconds: 300,
        maxBytes: MAX_DIRECT_IMAGE_UPLOAD_BYTES,
      });
    } catch (err) {
      if (err instanceof StorageError) {
        res.status(err.status).json({ error: err.code, message: err.message });
        return;
      }
      next(err);
    }
  },
);

// POST /api/v1/storage/images?workspaceId=…&filename=…
// The image bytes as the request body, with their Content-Type. Returns the
// public URL to put in the Markdown.
router.post(
  "/storage/images",
  requireAuth,
  express.raw({ type: () => true, limit: MAX_DIRECT_IMAGE_UPLOAD_BYTES }),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      if (!isStorageConfigured()) {
        res.status(503).json({ error: "storage_not_configured" });
        return;
      }
      const contentType = (req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      if (!isImageMime(contentType)) {
        res.status(400).json({
          error: "unsupported_mime",
          message: "Image content-type must be JPEG, PNG, WebP, GIF, or SVG.",
        });
        return;
      }
      const body = req.body as Buffer | undefined;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: "empty_body", message: "Send the image bytes as the request body." });
        return;
      }
      const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
      const workspace = workspaceId ? await getWorkspaceSettings(userId, workspaceId) : null;
      if (!workspace) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const { url } = await uploadObject({
        key: storageKeys.postImage(workspace.id, extForMime(contentType)),
        body,
        contentType,
      });
      res.status(201).json({ url });
    } catch (err) {
      if (err instanceof StorageError) {
        res.status(err.status).json({ error: err.code, message: err.message });
        return;
      }
      next(err);
    }
  },
);

export default router;
