import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@opendocs/shared/db";
import { user } from "@opendocs/shared/db/schema";
import {
  completeOnboarding,
  getOnboardingState,
} from "@opendocs/shared/workspaces/service";
import { createApiKey } from "@opendocs/shared/api-keys/service";
import { trackSignupConversion } from "@opendocs/ads/server";
import { requireSessionAuth } from "../auth/middleware";
import { validateBody } from "../middleware/validate";
import type { AuthenticatedRequest } from "../types";

const router = Router();

const onboardingSchema = z.object({
  username: z.string().trim().min(3).max(32),
  fullName: z.string().trim().max(120).optional(),
  workspaceName: z.string().trim().min(2).max(120).optional(),
  workspaceSlug: z.string().trim().min(3).max(32).optional(),
});

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const safeDecode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), safeDecode(part.slice(index + 1))];
      }),
  );
}

function getClientIp(req: AuthenticatedRequest): string | undefined {
  const forwardedFor = req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || req.ip || undefined;
}

router.post(
  "/onboarding",
  requireSessionAuth,
  validateBody(onboardingSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;

      // Snapshot pre-state to detect if a new workspace is created
      const preState = await getOnboardingState(userId);

      const onboarding = await completeOnboarding({
        userId,
        username: req.body.username,
        fullName: req.body.fullName,
        workspaceName: req.body.workspaceName,
        workspaceSlug: req.body.workspaceSlug,
      });

      // Auto-create first API key for new workspace owners
      let apiKey = null;
      if (!preState.hasWorkspace && onboarding.workspace) {
        try {
          apiKey = await createApiKey(
            userId,
            onboarding.workspace.id,
            "Default",
          );
        } catch {
          // Non-fatal — user can create keys later from dashboard
        }
      }

      const adEventId = `registration:${crypto.randomUUID()}`;

      if (db && !preState.completed) {
        const [currentUser] = await db
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, userId))
          .limit(1);
        const cookies = parseCookieHeader(req.header("cookie"));

        if (currentUser?.email) {
          void trackSignupConversion(
            {
              eventId: adEventId,
              email: currentUser.email,
              userId,
              status: onboarding.workspace ? "workspace_created" : "invited",
            },
            {
              ip: getClientIp(req as AuthenticatedRequest),
              userAgent: req.header("user-agent"),
              cookies,
            },
          );
        }
      }

      res.json({ ...onboarding, apiKey, adEventId });
    } catch (err) {
      if (err instanceof Error) {
        res.status(400).json({
          error: "onboarding_failed",
          message: "Unable to complete onboarding.",
        });
        return;
      }
      next(err);
    }
  },
);

export default router;
