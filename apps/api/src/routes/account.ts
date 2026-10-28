import { Router } from "express";

import {
  AccountDeletionBlockedError,
  checkCanDeleteAccount,
  deleteAccount,
} from "@opendocs/shared/account/service";

import { requireSessionAuth } from "../auth/middleware";
import type { AuthenticatedRequest } from "../types";

const router = Router();

router.get("/account/delete-check", requireSessionAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const check = await checkCanDeleteAccount(userId);
    res.json(check);
  } catch (err) {
    next(err);
  }
});

router.delete("/account", requireSessionAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    await deleteAccount(userId);
    res.status(204).end();
  } catch (err) {
    if (err instanceof AccountDeletionBlockedError) {
      const { reason } = err.check;
      res.status(409).json({
        code: reason,
        ...err.check,
      });
      return;
    }
    next(err);
  }
});

export default router;
