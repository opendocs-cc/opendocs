"use server";

import { revalidatePath } from "next/cache";

import { requireServerSession } from "@/lib/auth/session";
import {
  addDriveFolder,
  connectDocuSeal,
  disconnectIntegration,
  getDrivePickerConfig,
  removeDriveFolder,
  renameDriveFolder,
  updateDocuSealWebhookSecret,
} from "@opendocs/shared/integrations/connections";
import {
  isIntegrationProviderId,
  type DocuSealRegion,
  type IntegrationSettings,
} from "@opendocs/shared/integrations/providers";
import { isServiceError, updateIntegrationSettings, type ServiceError } from "@opendocs/shared/integrations/service";
import { cancelSignatureRequest, sendSignatureRequest } from "@opendocs/shared/integrations/signatures";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; message: string };

const MESSAGES: Record<string, string> = {
  plan_required: "Integrations are part of the Pro and Team plans.",
  forbidden: "Only workspace owners and admins can do that.",
  not_found: "That no longer exists. Refresh the page.",
  integration_not_connected: "isn't connected to this workspace.",
  reconnect_required: "needs to be reconnected. Its access was revoked or the key stopped working.",
  not_configured: "This isn't set up on the server yet.",
  invalid_name: "Give the folder a name of up to 80 characters.",
  name_taken: "Another folder already has that name.",
  invalid_settings: "Unknown setting.",
  already_sent: "This request has already been sent.",
  already_completed: "Everyone has already signed.",
};

const PROVIDER_NAMES: Record<string, string> = { google_drive: "Google Drive", docuseal: "DocuSeal" };

function fail(result: ServiceError): { ok: false; error: string; message: string } {
  if (typeof result.message === "string") return { ok: false, error: result.error, message: result.message };
  const known = MESSAGES[result.error] ?? "Something went wrong.";
  // "isn't connected…" / "needs to be reconnected…" read after the provider's name.
  const provider = PROVIDER_NAMES[String(result.provider)] ?? "The integration";
  const message = /^[a-z]/.test(known) ? `${provider} ${known}` : known;
  return { ok: false, error: result.error, message };
}

function done() {
  revalidatePath("/dashboard/integrations");
}

export async function updateSettingsAction(
  workspaceId: string,
  settings: Partial<IntegrationSettings>,
): Promise<ActionResult<{ settings: IntegrationSettings }>> {
  const session = await requireServerSession();
  const result = await updateIntegrationSettings(session.user.id, workspaceId, settings);
  if (isServiceError(result)) return fail(result);
  done();
  return { ok: true, settings: result };
}

export async function connectDocuSealAction(
  workspaceId: string,
  input: { region: DocuSealRegion; customUrl?: string; apiKey: string },
): Promise<ActionResult<{ account: string | null }>> {
  const session = await requireServerSession();
  if (!["com", "eu", "custom"].includes(input.region)) return { ok: false, error: "invalid_region", message: "Pick a region." };
  const result = await connectDocuSeal(session.user.id, workspaceId, {
    region: input.region,
    customUrl: input.customUrl ?? null,
    apiKey: input.apiKey,
  });
  if (isServiceError(result)) return fail(result);
  done();
  return { ok: true, account: result.account };
}

export async function saveWebhookSecretAction(workspaceId: string, secret: string | null): Promise<ActionResult> {
  const session = await requireServerSession();
  const result = await updateDocuSealWebhookSecret(session.user.id, workspaceId, secret);
  if (isServiceError(result)) return fail(result);
  done();
  return { ok: true };
}

export async function disconnectAction(workspaceId: string, provider: string): Promise<ActionResult> {
  const session = await requireServerSession();
  if (!isIntegrationProviderId(provider)) return { ok: false, error: "not_found", message: MESSAGES.not_found };
  const result = await disconnectIntegration(session.user.id, workspaceId, provider);
  if (isServiceError(result)) return fail(result);
  done();
  return { ok: true };
}

/** A short-lived Drive token and the Picker keys, to open the folder picker in the browser. */
export async function getPickerConfigAction(
  workspaceId: string,
): Promise<ActionResult<{ accessToken: string; apiKey: string; appId: string; account: string }>> {
  const session = await requireServerSession();
  const result = await getDrivePickerConfig(session.user.id, workspaceId);
  if (isServiceError(result)) return fail(result);
  return { ok: true, ...result };
}

export async function addFolderAction(
  workspaceId: string,
  input: { folderId: string; name: string },
): Promise<ActionResult> {
  const session = await requireServerSession();
  const result = await addDriveFolder(session.user.id, workspaceId, input);
  if (isServiceError(result)) return fail(result);
  done();
  return { ok: true };
}

export async function renameFolderAction(workspaceId: string, destinationId: string, name: string): Promise<ActionResult> {
  const session = await requireServerSession();
  const result = await renameDriveFolder(session.user.id, workspaceId, destinationId, name);
  if (isServiceError(result)) return fail(result);
  done();
  return { ok: true };
}

export async function removeFolderAction(workspaceId: string, destinationId: string): Promise<ActionResult> {
  const session = await requireServerSession();
  const result = await removeDriveFolder(session.user.id, workspaceId, destinationId);
  if (isServiceError(result)) return fail(result);
  done();
  return { ok: true };
}

/** Send a draft from the approval page: a signed-in person confirming in the browser. */
export async function sendSignatureAction(requestId: string): Promise<ActionResult> {
  const session = await requireServerSession();
  const result = await sendSignatureRequest({
    actor: { userId: session.user.id, authMethod: "session", client: "web" },
    requestId,
  });
  if (isServiceError(result)) return fail(result);
  revalidatePath(`/dashboard/integrations/signatures/${requestId}`);
  done();
  return { ok: true };
}

export async function cancelSignatureAction(requestId: string): Promise<ActionResult> {
  const session = await requireServerSession();
  const result = await cancelSignatureRequest({
    actor: { userId: session.user.id, authMethod: "session", client: "web" },
    requestId,
  });
  if (isServiceError(result)) return fail(result);
  revalidatePath(`/dashboard/integrations/signatures/${requestId}`);
  done();
  return { ok: true };
}
