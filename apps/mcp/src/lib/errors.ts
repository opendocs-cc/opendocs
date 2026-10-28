import type { CallToolResult } from "@modelcontextprotocol/server";

import { ApiError } from "../api-client";
import { config } from "../config";
import { fail } from "./result";

/**
 * Turns API errors into tool errors that tell the model what happened and
 * what to do next. Messages from the API are already written for agents;
 * these add the MCP-specific next step (which tool to call, what to ask the
 * user). Plan limits are stated plainly, never as a sales pitch: for the
 * codes in PLAN_LIMITS the API's own message (which can point at billing)
 * is replaced, because chat app directories don't allow plugins to promote
 * upgrades.
 */
const NEXT_STEP: Record<string, string> = {
  not_found: "Call list_documents (or list_projects) to find the right one, or ask the user for the link.",
  document_limit:
    "Tell the user the workspace has reached its plan's limit of 50 documents. They can unpublish documents they no longer need. Don't suggest buying or upgrading anything.",
  docx_requires_pro: "Word export isn't included in this workspace's plan. Offer a PDF instead.",
  plan_required:
    "This isn't included in this workspace's plan. Tell the user plainly; don't suggest buying or upgrading anything.",
  version_conflict:
    "Someone changed the document since you read it. Call get_document to see the current version, show the user the difference, and only retry with force: true if they want their version to win.",
  confirm_public_required:
    "Making a document public needs the user's explicit yes. Ask them, then call again with confirm_public: true.",
  confirmation_required: "Ask the user to confirm in plain words, then call again with confirm: true.",
  project_not_found: "Call list_projects to see the projects in the workspace.",
  project_not_empty: "Move or delete the documents in the project first (list_documents with that project).",
  slug_taken: "Pick another slug, or leave it out to get one from the title.",
  reserved_slug: "That slug is reserved. Pick another one, or leave it out.",
  not_a_member: "Call get_account to see the workspaces the user belongs to.",
  forbidden: "The user doesn't have permission for this in that workspace (owners and admins do).",
  member_limit:
    "The workspace has reached its plan's member limit (pending invitations count). Tell the user; don't suggest buying or upgrading anything.",
  plan_limit: "The account has reached its workspace limit. Tell the user.",
  integration_not_connected:
    `Google Drive or DocuSeal isn't connected for this workspace. An owner or admin connects it in Dashboard → Integrations (${config.webUrl}/dashboard/integrations).`,
  reconnect_required:
    "The integration needs to be reconnected by an owner or admin in Dashboard → Integrations.",
  destination_not_found:
    "Use a folder name exactly as get_account lists it under integrations. Ask the user which folder if unsure.",
  approval_required:
    "This workspace requires sending signature requests from the browser. Give the user the approval link on its own line; don't retry.",
  signer_roles_mismatch:
    "Every role in the document's signature block needs exactly one signer. Ask the user who signs each role.",
  invalid_signers: "Ask the user for each signer's full name and email; never guess them.",
  already_sent: "The request was already sent. Use get_signature_request to check its status.",
  not_completed: "Not everyone has signed yet. Use get_signature_request to check progress.",
  not_available: "The draft PDF is only kept until the request is sent.",
  low_contrast:
    "That color is too light for headings and table headers. Use a darker shade of the same hue (at least 4.5:1 against white).",
  invalid_token:
    "The connection to OpenDocs expired or was disconnected. Ask the user to reconnect OpenDocs in this app's connector settings.",
  unauthorized:
    "The connection to OpenDocs expired or was disconnected. Ask the user to reconnect OpenDocs in this app's connector settings.",
  insufficient_scope:
    "The user didn't give this app that permission. They can reconnect OpenDocs and tick it on the consent screen.",
  rate_limited: "Too many requests in a short time. Wait a minute and try again; don't loop.",
  export_failed: "The document converter failed. Try once more in a moment.",
  export_timeout: "The export took too long. Try once more, or export fewer documents at a time.",
  storage_not_configured: "Image uploads aren't available right now. Use an image URL in the Markdown instead.",
};

const PLAN_LIMITS = new Set(["document_limit", "docx_requires_pro", "plan_required", "member_limit", "plan_limit"]);

export function apiErrorResult(err: unknown): CallToolResult {
  if (err instanceof ApiError) {
    const code = err.code;
    const next = NEXT_STEP[code] ?? (err.status === 401 ? NEXT_STEP.invalid_token : undefined);
    if (PLAN_LIMITS.has(code) && next) return fail(next, { error: code, status: err.status });
    const message = err.body.message ?? err.body.error_description ?? `The request failed (${err.status}).`;
    const extras: Record<string, unknown> = { error: code, status: err.status };
    for (const key of ["approveUrl", "destinations", "roles", "currentVersionNumber", "details", "scope"]) {
      if (err.body[key] !== undefined) extras[key] = err.body[key];
    }
    return fail(next ? `${message}\n\n${next}` : message, extras);
  }
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return fail("OpenDocs took too long to answer. Try again in a moment.", { error: "timeout" });
  }
  if (err instanceof UserFacingError) {
    return fail(err.message, { error: err.code });
  }
  console.error("[mcp] unexpected tool error", err);
  return fail("Something went wrong on the OpenDocs side. Try again in a moment.", { error: "internal_error" });
}

/** An error raised by a tool itself (bad input it can explain). */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly code = "invalid_input",
  ) {
    super(message);
  }
}
