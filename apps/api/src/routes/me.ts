import { Router } from "express";

import { getDocumentQuota } from "@opendocs/shared/billing/quota";
import {
  getOnboardingState,
  getWorkspaceSettings,
} from "@opendocs/shared/workspaces/service";
import { requireAuth } from "../auth/middleware";
import type { AuthenticatedRequest } from "../types";

const router = Router();

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const onboarding = await getOnboardingState(userId);

    // Surface the target workspace's document quota so the CLI can
    // pre-check `opendocs publish` before hitting the batch endpoint.
    // `null` limit/remaining means "unlimited" (Pro/Team) — JSON
    // can't round-trip `Infinity`.
    //
    // Multi-workspace callers should pass `?workspaceId=` so the quota
    // reflects the workspace they're about to publish to. If omitted,
    // we fall back to the onboarding workspace (the earliest-joined one,
    // which the CLI also picks at login) — fine for single-workspace
    // users. `/publish/batch` always re-checks the quota against the
    // explicit workspaceId in the request body, so this field is purely
    // advisory.
    const requestedWorkspaceId =
      typeof req.query.workspaceId === "string" && req.query.workspaceId.length > 0
        ? req.query.workspaceId
        : undefined;

    let documentQuota = null;
    let quotaWorkspaceId: string | null = null;
    if (requestedWorkspaceId) {
      const ws = await getWorkspaceSettings(userId, requestedWorkspaceId);
      if (ws) quotaWorkspaceId = ws.id;
    } else if (onboarding.workspace) {
      quotaWorkspaceId = onboarding.workspace.id;
    }
    if (quotaWorkspaceId) {
      const quota = await getDocumentQuota(quotaWorkspaceId);
      documentQuota = {
        plan: quota.plan,
        limit: Number.isFinite(quota.limit) ? quota.limit : null,
        used: quota.used,
        remaining: Number.isFinite(quota.remaining) ? quota.remaining : null,
      };
    }

    res.json({
      authenticated: true,
      userId,
      onboarding,
      quota: {
        documents: documentQuota,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
