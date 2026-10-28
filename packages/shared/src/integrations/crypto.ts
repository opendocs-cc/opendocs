import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Integration credentials (OAuth refresh tokens, API keys, webhook
 * secrets) are encrypted at rest with AES-256-GCM.
 *
 * INTEGRATIONS_ENCRYPTION_KEY is 32 random bytes, base64 or hex:
 *   openssl rand -base64 32
 *
 * Stored format: `v1:<iv>:<auth tag>:<ciphertext>`, each part base64. The
 * version prefix leaves room to rotate keys later (v2 with a new key,
 * decrypting v1 with the old one).
 */

export class IntegrationsNotConfiguredError extends Error {
  constructor() {
    super(
      "Integrations aren't configured on this server: set INTEGRATIONS_ENCRYPTION_KEY to 32 random bytes (openssl rand -base64 32).",
    );
    this.name = "IntegrationsNotConfiguredError";
  }
}

function readKey(): Buffer | null {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

export function isIntegrationsEncryptionConfigured(): boolean {
  return readKey() !== null;
}

export function encryptSecret(value: unknown): string {
  const key = readKey();
  if (!key) throw new IntegrationsNotConfiguredError();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ciphertext].map((part) =>
    typeof part === "string" ? part : part.toString("base64"),
  ).join(":");
}

export function decryptSecret<T>(stored: string): T {
  const key = readKey();
  if (!key) throw new IntegrationsNotConfiguredError();
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) {
    throw new Error("Unrecognised integration credential format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
}
