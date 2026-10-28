import { Router } from "express";
import { z } from "zod";

import { listApiKeys, createApiKey, revokeApiKey } from "@opendocs/shared/api-keys/service";
import { getWorkspaceSettings } from "@opendocs/shared/workspaces/service";
import { requireSessionAuth } from "../auth/middleware";
import { validateBody } from "../middleware/validate";
import type { AuthenticatedRequest } from "../types";

const router = Router();

const createKeySchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(100),
});

router.get("/api-keys", requireSessionAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const keys = await listApiKeys(userId);
    res.json({ keys });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/api-keys",
  requireSessionAuth,
  validateBody(createKeySchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { workspaceId, name } = req.body as z.infer<typeof createKeySchema>;

      // Verify the caller is an active member of the target workspace.
      // Prevents creating keys for workspaces the caller isn't in even
      // though `createApiKey` itself also guards against this.
      const workspace = await getWorkspaceSettings(userId, workspaceId);
      if (!workspace) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      const result = await createApiKey(userId, workspaceId, name);

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.delete("/api-keys/:keyId", requireSessionAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const result = await revokeApiKey(userId, req.params.keyId as string);

    if (!result) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
