import { Router, type Response } from "express";
import { z } from "zod";

import {
  checkCustomDomainForUser,
  getCustomDomainForUser,
  removeCustomDomainForUser,
  setCustomDomainForUser,
  updateCustomDomainSettingsForUser,
  type CustomDomainError,
} from "@opendocs/shared/custom-domains/service";
import { requireAuth } from "../auth/middleware";
import { domainCheckRateLimit } from "../middleware/rate-limit";
import { invalidRequestBody, validateBody } from "../middleware/validate";
import type { AuthenticatedRequest } from "../types";

// A workspace's custom domain (packages/shared/src/custom-domains). Members
// can read it; owners and admins on Pro or Team can set, check and remove
// it. Session cookies and API keys both work, so agents and the CLI can
// manage it too.

const router = Router();

const workspaceQuerySchema = z.object({ workspaceId: z.string().min(1) });
const setDomainSchema = z.object({
  workspaceId: z.string().min(1),
  hostname: z.string().max(300),
});
const checkDomainSchema = z.object({ workspaceId: z.string().min(1) });
const domainSettingsSchema = z.object({
  workspaceId: z.string().min(1),
  showPoweredBy: z.boolean(),
});

const ERROR_STATUS: Record<CustomDomainError["error"], number> = {
  not_found: 404,
  forbidden: 403,
  plan_required: 403,
  invalid_hostname: 400,
  domain_taken: 409,
  rate_limited: 429,
};

function sendDomainError(res: Response, result: CustomDomainError) {
  if (result.error === "not_found") {
    res.status(404).json({ error: "not_found", message: "Workspace not found." });
    return;
  }
  res.status(ERROR_STATUS[result.error]).json(result);
}

// GET /api/v1/workspace/domain?workspaceId=...
router.get("/workspace/domain", requireAuth, async (req, res, next) => {
  try {
    const parsed = workspaceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json(invalidRequestBody(parsed.error));
      return;
    }
    const { userId } = req as AuthenticatedRequest;
    const result = await getCustomDomainForUser(userId, parsed.data.workspaceId);
    if ("error" in result) {
      sendDomainError(res, result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/workspace/domain { workspaceId, hostname }
// Saving runs a DNS check for anything that isn't already active, so it
// shares the "Check now" limit.
router.put("/workspace/domain", requireAuth, domainCheckRateLimit, validateBody(setDomainSchema), async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const result = await setCustomDomainForUser(userId, req.body.workspaceId, req.body.hostname);
    if ("error" in result) {
      sendDomainError(res, result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/workspace/domain/check { workspaceId }
router.post(
  "/workspace/domain/check",
  requireAuth,
  domainCheckRateLimit,
  validateBody(checkDomainSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await checkCustomDomainForUser(userId, req.body.workspaceId);
      if ("error" in result) {
        sendDomainError(res, result);
        return;
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/workspace/domain { workspaceId, showPoweredBy }
router.patch("/workspace/domain", requireAuth, validateBody(domainSettingsSchema), async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const result = await updateCustomDomainSettingsForUser(userId, req.body.workspaceId, {
      showPoweredBy: req.body.showPoweredBy,
    });
    if ("error" in result) {
      sendDomainError(res, result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/workspace/domain?workspaceId=...
router.delete("/workspace/domain", requireAuth, async (req, res, next) => {
  try {
    const parsed = workspaceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json(invalidRequestBody(parsed.error));
      return;
    }
    const { userId } = req as AuthenticatedRequest;
    const result = await removeCustomDomainForUser(userId, parsed.data.workspaceId);
    if ("error" in result) {
      sendDomainError(res, result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
