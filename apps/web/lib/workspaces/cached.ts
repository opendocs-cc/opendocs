import { cache } from "react";
import {
  getOnboardingState as _getOnboardingState,
  getProfileSettings as _getProfileSettings,
  getDashboardData as _getDashboardData,
  getTeamMembers as _getTeamMembers,
  getTeamStats as _getTeamStats,
  getPendingInvitations as _getPendingInvitations,
  getUserWorkspaces as _getUserWorkspaces,
  getWorkspaceDeletionPreview as _getWorkspaceDeletionPreview,
  getTeamInviteOnboardingDismissedAt as _getTeamInviteOnboardingDismissedAt,
} from "@opendocs/shared/workspaces/service";

export const getOnboardingState = cache(_getOnboardingState);
export const getProfileSettings = cache(_getProfileSettings);
export const getDashboardData = cache(_getDashboardData);
export const getTeamMembers = cache(_getTeamMembers);
export const getTeamStats = cache(_getTeamStats);
export const getPendingInvitations = cache(_getPendingInvitations);
export const getUserWorkspaces = cache(_getUserWorkspaces);
export const getWorkspaceDeletionPreview = cache(_getWorkspaceDeletionPreview);
export const getTeamInviteOnboardingDismissedAt = cache(
  _getTeamInviteOnboardingDismissedAt,
);

export {
  getUserPlan,
  getUserEffectiveBillingTier,
  getUserCompedTier,
  getUserWorkspaceLimit,
  getEffectiveWorkspaceTier,
  getOwnedWorkspaceCount,
  getOwnedWorkspaceUniqueMemberCount,
  createWorkspace,
  updateProfileSettings,
  completeOnboarding,
  getProfileByWorkspaceSlugFromDb,
  getPostByWorkspaceSlugAndPostSlug,
  getPostAccessState,
  getRelatedPostsByTags,
  getWorkspaceSearchIndex,
  getWorkspaceSettings,
  updateWorkspaceName,
  updateAllowPublicDocuments,
  updateWorkspaceDefaultSort,
  updateWorkspaceBio,
  updateBrandColor,
  updateLogoUrl,
  updateShowLogoInExports,
  updateWorkspaceSlug,
  updateExportFont,
  updateExportFooter,
  deleteWorkspace,
  dismissTeamInviteOnboarding,
  inviteTeamMember,
  resendInvitation,
  cancelInvitation,
  changeMemberRole,
  removeTeamMember,
  acceptInvitation,
  getInvitationLandingState,
  getUserWorkspaces as getUserWorkspacesUncached,
} from "@opendocs/shared/workspaces/service";
