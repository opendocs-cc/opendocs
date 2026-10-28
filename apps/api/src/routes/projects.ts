import { Router } from "express";
import { z } from "zod";

import {
  createProjectForUser,
  deleteProjectForUser,
  getDefaultProjectForUser,
  listProjectsForUser,
  renameProjectForUser,
  resolveProjectForUser,
} from "@opendocs/shared/projects/service";
import { requireAuth } from "../auth/middleware";
import { validateBody } from "../middleware/validate";
import type { AuthenticatedRequest } from "../types";

const router = Router();

const workspaceQuerySchema = z.object({
  workspaceId: z.string().trim().min(1),
});

const createProjectSchema = z.object({
  workspaceId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(64).optional(),
});

const renameProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z.string().trim().min(1).max(64).optional(),
  })
  .refine((value) => value.name || value.slug, {
    message: "Provide name or slug.",
  });

function projectStatus(error: string) {
  switch (error) {
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "slug_taken":
      return 409;
    case "project_not_empty":
    case "default_project":
    case "invalid_slug":
    case "reserved_slug":
    default:
      return 400;
  }
}

router.get("/projects", requireAuth, async (req, res, next) => {
  try {
    const parsed = workspaceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthenticatedRequest;
    const projects = await listProjectsForUser(userId, parsed.data.workspaceId);
    if (!projects) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const defaultProject = projects.find((project) => project.isDefault) ?? null;
    res.json({ projects, defaultProject });
  } catch (err) {
    next(err);
  }
});

router.get("/projects/default", requireAuth, async (req, res, next) => {
  try {
    const parsed = workspaceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthenticatedRequest;
    const project = await getDefaultProjectForUser(userId, parsed.data.workspaceId);
    if (!project) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

router.get("/projects/resolve", requireAuth, async (req, res, next) => {
  try {
    const parsed = z
      .object({
        workspaceId: z.string().trim().min(1),
        projectId: z.string().trim().min(1).optional(),
        projectSlug: z.string().trim().min(1).optional(),
      })
      .safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.flatten() });
      return;
    }
    const { userId } = req as AuthenticatedRequest;
    const project = await resolveProjectForUser({
      userId,
      workspaceId: parsed.data.workspaceId,
      projectId: parsed.data.projectId,
      projectSlug: parsed.data.projectSlug,
    });
    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ project });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/projects",
  requireAuth,
  validateBody(createProjectSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await createProjectForUser(userId, req.body);
      if ("error" in result) {
        res.status(projectStatus(result.error)).json(result);
        return;
      }
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/projects/:projectId",
  requireAuth,
  validateBody(renameProjectSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await renameProjectForUser(
        userId,
        req.params.projectId as string,
        req.body,
      );
      if ("error" in result) {
        res.status(projectStatus(result.error)).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.delete("/projects/:projectId", requireAuth, async (req, res, next) => {
  try {
    const { userId } = req as AuthenticatedRequest;
    const result = await deleteProjectForUser(
      userId,
      req.params.projectId as string,
    );
    if ("error" in result) {
      res.status(projectStatus(result.error)).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

