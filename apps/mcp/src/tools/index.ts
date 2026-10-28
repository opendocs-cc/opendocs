import { getAccount, setDefaults } from "./account";
import {
  editDocument,
  getDocument,
  getDocumentHistory,
  listDocuments,
  publishDocument,
  publishDocuments,
  updateDocument,
} from "./documents";
import { exportDocument, uploadImage } from "./files";
import { integrationTools } from "./integrations";
import {
  claimAnonymousDocument,
  deleteDocument,
  moveDocument,
  restoreDocumentVersion,
  setDocumentVisibility,
  shareDocument,
  unpublishDocument,
} from "./manage";
import { createProject, deleteProject, listProjects, renameProject } from "./projects";
import { teamTools } from "./team";
import { themeTools } from "./theme";
import type { AnyTool } from "./types";

/**
 * Every tool, in the order clients list them (MCP asks for a stable
 * order). Reading and the everyday writing tools first; admin and
 * integration tools last. tools/list only includes the tools whose scope
 * the connection was granted.
 */
export const TOOLS: AnyTool[] = [
  getAccount,
  listDocuments,
  getDocument,
  listProjects,
  publishDocument,
  publishDocuments,
  editDocument,
  updateDocument,
  exportDocument,
  shareDocument,
  setDocumentVisibility,
  moveDocument,
  getDocumentHistory,
  restoreDocumentVersion,
  unpublishDocument,
  deleteDocument,
  uploadImage,
  claimAnonymousDocument,
  createProject,
  renameProject,
  deleteProject,
  setDefaults,
  ...teamTools,
  ...themeTools,
  ...integrationTools,
];
