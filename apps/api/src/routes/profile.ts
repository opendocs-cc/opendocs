import { Router } from "express";
import { z } from "zod";
import multer from "multer";

import {
  getProfileSettings,
  updateProfileSettings,
  updateUsername,
} from "@opendocs/shared/workspaces/service";
import {
  uploadObject,
  storageKeys,
  extForMime,
  isImageMime,
  isStorageConfigured,
  StorageError,
} from "@opendocs/shared/storage/r2";
import { requireAuth, requireSessionAuth } from "../auth/middleware";
import { singleFileUpload } from "../middleware/upload";
import { validateBody } from "../middleware/validate";
import type { AuthenticatedRequest } from "../types";

const router = Router();

const updateProfileSchema = z.object({
  fullName: z.string().max(120).optional().nullable(),
  profilePictureUrl: z.string().max(2048).optional().nullable(),
});

const updateUsernameSchema = z.object({
  username: z.string().trim().min(3).max(32),
});

// 2 MB cap — same as workspace logos.
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.get("/profile", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const profile = await getProfileSettings(userId);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/profile",
  requireSessionAuth,
  validateBody(updateProfileSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      await updateProfileSettings(userId, req.body);
      const profile = await getProfileSettings(userId);
      res.json({ profile });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/profile/username
// Renames the signed-in user's username. Validates the new value and
// surfaces specific 4xx codes for the four user-fixable failure modes.
router.post(
  "/profile/username",
  requireSessionAuth,
  validateBody(updateUsernameSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      await updateUsername(userId, req.body.username);
      const profile = await getProfileSettings(userId);
      res.json({ profile });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (
        code === "invalid_username" ||
        code === "reserved_username" ||
        code === "username_taken" ||
        code === "no_username"
      ) {
        res.status(code === "username_taken" ? 409 : 400).json({
          error: code,
          message: err instanceof Error ? err.message : "Unable to update username.",
        });
        return;
      }
      next(err);
    }
  },
);

// POST /api/v1/profile/avatar/upload
// Multipart upload. Stores image in R2 and sets profilePictureUrl.
router.post(
  "/profile/avatar/upload",
  requireSessionAuth,
  singleFileUpload(avatarUpload, "file", { tooLarge: "Avatar must be 2 MB or smaller." }),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;

      if (!isStorageConfigured()) {
        res.status(503).json({ error: "storage_not_configured" });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "missing_file" });
        return;
      }

      if (!isImageMime(file.mimetype)) {
        res.status(400).json({
          error: "unsupported_mime",
          message: "Avatar must be JPEG, PNG, WebP, GIF, or SVG.",
        });
        return;
      }

      const ext = extForMime(file.mimetype);
      const key = storageKeys.userAvatar(userId, ext);

      const { url } = await uploadObject({
        key,
        body: file.buffer,
        contentType: file.mimetype,
      });

      await updateProfileSettings(userId, { profilePictureUrl: url });
      const profile = await getProfileSettings(userId);

      res.json({ profilePictureUrl: url, profile });
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
