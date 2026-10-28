import express, { Router } from "express";

import { PLAN_LIMITS } from "@opendocs/shared/billing/plan-limits";
import {
  PlanLimitError,
  ReservedPostSlugError,
  getPublishedPostCount,
  publishPostForUser,
} from "@opendocs/shared/posts/service";
import {
  publishInputSchema,
  batchPublishInputSchema,
  type BatchPublishInput,
  type PublishInput,
} from "@opendocs/shared/posts/validation";
import { getEffectiveWorkspaceTier } from "@opendocs/shared/workspaces/service";
import { requireAuth } from "../auth/middleware";
import { validateBody } from "../middleware/validate";
import { readClient } from "../middleware/client";
import { withPublicUrl } from "../lib/public-url";
import {
  publishRateLimit,
  batchPublishRateLimit,
} from "../middleware/rate-limit";
import type { AuthenticatedRequest } from "../types";

// Serialize a PlanLimitError into the 403 JSON body. Shared between
// the single and batch routes so clients see a consistent shape.
function planLimitBody(err: PlanLimitError) {
  return {
    error: err.code,
    plan: err.plan,
    limit: err.limit,
    used: err.used,
    message: `Your ${err.plan} plan allows ${err.limit} published documents. You currently have ${err.used}.`,
  };
}

const router = Router();

// Retry once on any error with a 100 ms backoff. Deterministic failures
// (slug taken, workspace not found) will fail identically on the second
// attempt — we pay ~100 ms extra latency for those, but gain resilience
// against transient DB blips (connection reset, serialization conflict)
// that would otherwise kill one doc's publish in a 10-doc batch.
async function publishWithRetry(
  userId: string,
  input: PublishInput,
  client: string | null,
) {
  try {
    return await publishPostForUser(userId, input, { client });
  } catch (err) {
    // Plan caps and reserved slugs fail identically on retry.
    if (err instanceof PlanLimitError || err instanceof ReservedPostSlugError) throw err;
    await new Promise((resolve) => setTimeout(resolve, 100));
    return await publishPostForUser(userId, input, { client });
  }
}

router.post(
  "/publish",
  requireAuth,
  publishRateLimit,
  validateBody(publishInputSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const result = await publishPostForUser(userId, req.body, {
        client: readClient(req),
      });
      res.status(201).json(await withPublicUrl(result.postId, result));
    } catch (err) {
      if (err instanceof PlanLimitError) {
        res.status(403).json(planLimitBody(err));
        return;
      }
      if (err instanceof ReservedPostSlugError) {
        res.status(400).json({
          error: err.code,
          message: err.message,
        });
        return;
      }
      if (err instanceof Error) {
        res.status(400).json({
          error: "publish_failed",
          message: "Unable to publish document.",
        });
        return;
      }
      next(err);
    }
  },
);

// Batch publish. Up to 25 documents at a time (enforced by
// batchPublishInputSchema). Processed sequentially with partial-success
// semantics — one doc's failure doesn't abort the others; the response
// reports per-doc success/failure so the CLI can render a full summary.
//
// app.ts skips the global 2 MB parser for this route so this route-specific
// parser can accept 25 docs × 1 MB markdown max, plus JSON/field overhead.
type BatchResult =
  | {
      success: true;
      index: number;
      postId: string;
      slug: string;
      title: string;
      url: string;
      /** Absolute link to share; see lib/public-url.ts. */
      publicUrl: string;
      projectId: string;
      projectSlug: string;
      projectName: string;
      isDefaultProject: boolean;
      versionNumber: number;
    }
  | {
      success: false;
      index: number;
      error: string;
      message: string;
    };

// Publish one doc inside a batch and wrap the outcome as a BatchResult.
// Factored out so the JSON path and the SSE path share identical semantics
// (retry, error shape, index preservation).
async function publishDocForBatch(
  userId: string,
  doc: PublishInput,
  index: number,
  client: string | null,
): Promise<BatchResult> {
  try {
    const result = await publishWithRetry(userId, doc, client);
    return { success: true, index, ...(await withPublicUrl(result.postId, result)) };
  } catch (err) {
    if (err instanceof ReservedPostSlugError) {
      return {
        success: false,
        index,
        error: err.code,
        message: err.message,
      };
    }
    return {
      success: false,
      index,
      error: "publish_failed",
      message: "Unable to publish document.",
    };
  }
}

router.post(
  "/publish/batch",
  requireAuth,
  batchPublishRateLimit,
  express.json({ limit: "32mb" }),
  validateBody(batchPublishInputSchema),
  async (req, res, next) => {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { documents } = req.body as BatchPublishInput;

      // Atomic plan-limit pre-check: if any workspace in the batch
      // would be pushed over its cap, reject the entire batch up
      // front — partial publishes are worse than a clean "no".
      // Grouped by workspaceId because the batch schema doesn't
      // enforce a single workspace (the CLI sends one, but defence
      // in depth is cheap).
      const byWorkspace = new Map<string, number>();
      for (const doc of documents) {
        byWorkspace.set(
          doc.workspaceId,
          (byWorkspace.get(doc.workspaceId) ?? 0) + 1,
        );
      }
      for (const [workspaceId, count] of byWorkspace) {
        const tier =
          (await getEffectiveWorkspaceTier(workspaceId)) ?? "free";
        const limit = PLAN_LIMITS[tier].documentsPerWorkspace;
        if (!Number.isFinite(limit)) continue;
        const used = await getPublishedPostCount(workspaceId);
        if (used + count > limit) {
          const remaining = Math.max(0, limit - used);
          res.status(403).json({
            error: "document_limit",
            plan: tier,
            limit,
            used,
            requested: count,
            workspaceId,
            message: `This batch would publish ${count} document${count === 1 ? "" : "s"}, but your ${tier} plan allows ${limit} total. You have ${remaining} slot${remaining === 1 ? "" : "s"} left.`,
          });
          return;
        }
      }

      // Opt-in SSE mode based on Accept header. Same URL serves both clients:
      //  - Default (application/json, */*)  → existing 207 Multi-Status JSON
      //  - text/event-stream                 → per-doc events as they complete
      // This keeps the API surface small (one endpoint) while letting the CLI
      // show live progress in interactive mode.
      const wantsStream =
        req.headers.accept?.includes("text/event-stream") ?? false;

      // Sequential on purpose:
      //  1. avoids slug-allocation races in resolveUniqueSlug() (two concurrent
      //     publishes of the same title both see the slug as free and one
      //     fails on the unique constraint);
      //  2. keeps DB connection pool usage bounded under load;
      //  3. makes the 45s client-side timeout predictable (10 × ~1s = ~10s).
      if (wantsStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        // Disables nginx/Caddy response buffering so clients see frames as
        // they're written, not in one flush at the end.
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const results: BatchResult[] = [];
        for (let i = 0; i < documents.length; i++) {
          const result = await publishDocForBatch(userId, documents[i], i, readClient(req));
          results.push(result);
          res.write(`event: result\ndata: ${JSON.stringify(result)}\n\n`);
        }
        const succeeded = results.filter((r) => r.success).length;
        const summary = {
          total: documents.length,
          succeeded,
          failed: documents.length - succeeded,
        };
        res.write(`event: summary\ndata: ${JSON.stringify(summary)}\n\n`);
        res.end();
        return;
      }

      // Default JSON path, unchanged.
      const results: BatchResult[] = [];
      for (let i = 0; i < documents.length; i++) {
        results.push(await publishDocForBatch(userId, documents[i], i, readClient(req)));
      }

      const succeeded = results.filter((r) => r.success).length;

      // 207 Multi-Status: semantically accurate for partial success. Still a
      // 2xx, so clients that treat `res.ok` as success (ours does) don't
      // need special handling.
      res.status(207).json({
        results,
        summary: {
          total: documents.length,
          succeeded,
          failed: documents.length - succeeded,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
