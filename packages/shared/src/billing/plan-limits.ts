export type PlanTier = "free" | "pro" | "team";

/**
 * Single source of truth for per-plan limits. Imported by both the
 * server (enforcement in workspaces/service.ts) and the client (sidebar
 * gating in dashboard-nav.tsx, plan cards in billing-client.tsx).
 *
 * Team is uncapped on workspaces and members-per-workspace because
 * Paddle's per-seat subscription is the real limit on that side.
 *
 * This module has no server-only imports (no db, no Paddle), so it's
 * safe to import from client components.
 */
export const PLAN_LIMITS: Record<
  PlanTier,
  {
    workspaces: number;
    membersPerWorkspace: number;
    documentsPerWorkspace: number;
  }
> = {
  free: {
    workspaces: 1,
    membersPerWorkspace: 3,
    documentsPerWorkspace: 50,
  },
  pro: {
    workspaces: 2,
    membersPerWorkspace: 5,
    documentsPerWorkspace: Number.POSITIVE_INFINITY,
  },
  team: {
    workspaces: Number.POSITIVE_INFINITY,
    membersPerWorkspace: Number.POSITIVE_INFINITY,
    documentsPerWorkspace: Number.POSITIVE_INFINITY,
  },
};
