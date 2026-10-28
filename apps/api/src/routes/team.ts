import { Router, type Response } from "express";
import { z } from "zod";

import {
  acceptInvitationById,
  addAutoJoinDomain,
  declineInvitation,
  joinWorkspaceByDomain,
  leaveWorkspace,
  listAutoJoinDomains,
  listMyInvitations,
  removeAutoJoinDomain,
} from "@opendocs/shared/workspaces/service";
import { requireAuth } from "../auth/middleware";
import { validateBody } from "../middleware/validate";
import type { AuthenticatedRequest } from "../types";

/**
 * Team membership from the invitee's side and email-domain auto-join, all
 * API-key compatible so an agent can say "you've been invited to Acme —
 * join?" and do it. Admin-side invite/list/role/remove live in
 * routes/workspace.ts under /workspace/team.
 */

const router = Router();

const ERRORS: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: "Not found." },
  expired: { status: 410, message: "This invitation has expired. Ask an admin to send a new one." },
  forbidden: { status: 403, message: "Only workspace admins can do that." },
  email_not_verified: {
    status: 403,
    message: "Verify your email first: sign in with an emailed code (`opendocs login --email <you@example.com>`), then try again.",
  },
  member_limit: { status: 403, message: "This workspace has reached its plan's member limit. An admin needs to upgrade first." },
  billing_failed: { status: 402, message: "Couldn't add a Team seat for this member. Ask the workspace owner to check billing." },
  owner_cannot_leave: { status: 409, message: "Owners can't leave their own workspace. Transfer ownership or delete the workspace instead." },
  invalid_domain: { status: 400, message: "That doesn't look like a domain (e.g. acme.com)." },
  consumer_domain: { status: 400, message: "Personal email providers (gmail.com, outlook.com, ...) can't be auto-join domains." },
  domain_mismatch: { status: 403, message: "You can only add your own email's domain as an auto-join domain." },
};

function isServiceError(result: unknown): result is { error: string } & Record<string, unknown> {
  return typeof (result as { error?: unknown }).error === "string";
}

function sendServiceError(res: Response, result: { error: string } & Record<string, unknown>) {
  const known = ERRORS[result.error] ?? { status: 400, message: result.error };
  res.status(known.status).json({ ...result, message: known.message });
}

router.get("/me/invitations", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    res.json(await listMyInvitations(userId));
  } catch (err) {
    next(err);
  }
});

router.post("/invitations/:id/accept", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const result = await acceptInvitationById(userId, req.params.id as string);
    if (isServiceError(result)) {
      sendServiceError(res, result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/invitations/:id/decline", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const result = await declineInvitation(userId, req.params.id as string);
    if (isServiceError(result)) {
      sendServiceError(res, result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const workspaceBody = z.object({ workspaceId: z.string().trim().min(1) });

router.post("/workspace/leave", requireAuth, validateBody(workspaceBody), async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const result = await leaveWorkspace(userId, (req.body as z.infer<typeof workspaceBody>).workspaceId);
    if (isServiceError(result)) {
      sendServiceError(res, result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/workspace/auto-join", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
    if (!workspaceId) {
      res.status(400).json({ error: "missing_workspace_id", message: "Pass ?workspaceId=." });
      return;
    }
    const result = await listAutoJoinDomains(userId, workspaceId);
    if (isServiceError(result)) {
      sendServiceError(res, result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const domainBody = workspaceBody.extend({ domain: z.string().trim().min(3).max(253) });

router.post("/workspace/auto-join", requireAuth, validateBody(domainBody), async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { workspaceId, domain } = req.body as z.infer<typeof domainBody>;
    const result = await addAutoJoinDomain(userId, workspaceId, domain);
    if (isServiceError(result)) {
      sendServiceError(res, result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete("/workspace/auto-join", requireAuth, validateBody(domainBody), async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { workspaceId, domain } = req.body as z.infer<typeof domainBody>;
    const result = await removeAutoJoinDomain(userId, workspaceId, domain);
    if (isServiceError(result)) {
      sendServiceError(res, result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/workspaces/:workspace/join", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const result = await joinWorkspaceByDomain(userId, req.params.workspace as string);
    if (isServiceError(result)) {
      sendServiceError(res, result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
