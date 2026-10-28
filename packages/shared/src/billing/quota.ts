import { getPublishedPostCount } from "../posts/service";
import { getEffectiveWorkspaceTier } from "../workspaces/service";

import { PLAN_LIMITS, type PlanTier } from "./plan-limits";

export interface DocumentQuota {
  plan: PlanTier;
  limit: number;
  used: number;
  /** `Number.POSITIVE_INFINITY` for Pro/Team. */
  remaining: number;
}

/**
 * Snapshot of a workspace's document quota. Used by:
 *  - `GET /api/v1/me`              → CLI pre-check
 *  - `/dashboard/documents/page`   → webapp upload pre-check + quota UI
 *
 * The quota is evaluated against the workspace's *effective* plan
 * tier: Team comes from the workspace-level plan; Free/Pro comes
 * from the owner's personal plan. See `getEffectiveWorkspaceTier`.
 */
export async function getDocumentQuota(
  workspaceId: string,
): Promise<DocumentQuota> {
  const plan = (await getEffectiveWorkspaceTier(workspaceId)) ?? "free";
  const limit = PLAN_LIMITS[plan].documentsPerWorkspace;
  const used = await getPublishedPostCount(workspaceId);
  const remaining = Number.isFinite(limit)
    ? Math.max(0, limit - used)
    : Number.POSITIVE_INFINITY;
  return { plan, limit, used, remaining };
}
