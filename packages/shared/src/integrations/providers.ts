/**
 * The integrations OpenDocs offers, and the workspace settings that govern
 * them. No server-only imports: safe for client components (the dashboard's
 * Integrations page renders from this list).
 *
 * Adding a provider: add an entry here, declare what it can do
 * (`capabilities`), and implement it under this folder. Agent commands are
 * built on capabilities ("save a file", "request signatures"), not on
 * providers, so a second storage or signature provider slots in beside
 * the first.
 */

export type IntegrationProviderId = "google_drive" | "docuseal";
export type IntegrationCapability = "storage" | "signature";

export type IntegrationProvider = {
  id: IntegrationProviderId;
  name: string;
  description: string;
  capabilities: IntegrationCapability[];
  /** How a workspace connects: an OAuth consent screen, or a pasted API key. */
  connect: "oauth" | "api_key";
  docsUrl: string;
};

export const INTEGRATION_PROVIDERS: Record<IntegrationProviderId, IntegrationProvider> = {
  google_drive: {
    id: "google_drive",
    name: "Google Drive",
    description:
      "Save documents as PDF, Word or Markdown into Drive folders you choose, including shared drives. Only when you ask.",
    capabilities: ["storage"],
    connect: "oauth",
    docsUrl: "https://docs.opendocs.cc/integrations/google-drive",
  },
  docuseal: {
    id: "docuseal",
    name: "DocuSeal",
    description:
      "Send documents for e-signature. Signers get an email from DocuSeal; the signed PDF and its audit log come back here.",
    capabilities: ["signature"],
    connect: "api_key",
    docsUrl: "https://docs.opendocs.cc/integrations/docuseal",
  },
};

export const INTEGRATION_PROVIDER_IDS = Object.keys(INTEGRATION_PROVIDERS) as IntegrationProviderId[];

export function isIntegrationProviderId(value: string): value is IntegrationProviderId {
  return Object.prototype.hasOwnProperty.call(INTEGRATION_PROVIDERS, value);
}

/** Who may use connected integrations. Managing them is always owner/admin. */
export type IntegrationsUsableBy = "members" | "admins";
/** How an agent's signature request gets sent: after a "yes" in chat, or from the browser. */
export type SignatureConfirmation = "chat" | "browser";

export type IntegrationSettings = {
  usableBy: IntegrationsUsableBy;
  signatureConfirmation: SignatureConfirmation;
};

export const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettings = {
  usableBy: "members",
  signatureConfirmation: "chat",
};

export function normalizeIntegrationSettings(raw: {
  integrationsUsableBy?: string | null;
  signatureConfirmation?: string | null;
}): IntegrationSettings {
  return {
    usableBy: raw.integrationsUsableBy === "admins" ? "admins" : "members",
    signatureConfirmation: raw.signatureConfirmation === "browser" ? "browser" : "chat",
  };
}

/** DocuSeal cloud regions. Self-hosted instances pass their own base URL. */
export const DOCUSEAL_REGIONS = {
  com: { label: "DocuSeal (docuseal.com)", baseUrl: "https://api.docuseal.com" },
  eu: { label: "DocuSeal EU (docuseal.eu)", baseUrl: "https://api.docuseal.eu" },
} as const;

export type DocuSealRegion = keyof typeof DOCUSEAL_REGIONS | "custom";

/** Formats a destination can store a document in. */
export const STORAGE_FORMATS = ["pdf", "docx", "md"] as const;
export type StorageFormat = (typeof STORAGE_FORMATS)[number];

export const SIGNATURE_REQUEST_STATUSES = [
  "draft",
  "pending",
  "completed",
  "declined",
  "expired",
  "cancelled",
  "failed",
] as const;
export type SignatureRequestStatus = (typeof SIGNATURE_REQUEST_STATUSES)[number];

export const MAX_SIGNERS = 10;
