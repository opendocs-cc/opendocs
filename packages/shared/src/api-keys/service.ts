import { createHash, randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import { apiKeys, auditEvents } from "../db/schema";

export function generateApiKey(): string {
  const random = randomBytes(24).toString("hex").slice(0, 32);
  return `od_live_${random}`;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function listApiKeys(userId: string) {
  const database = getDbOrThrow();
  return database
    .select({
      id: apiKeys.id,
      label: apiKeys.label,
      keyHint: apiKeys.keyHint,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
}

export async function createApiKey(
  userId: string,
  workspaceId: string,
  label: string,
) {
  const database = getDbOrThrow();
  const plaintext = generateApiKey();
  const hashed = hashApiKey(plaintext);
  const hint = plaintext.slice(-4);

  const [record] = await database
    .insert(apiKeys)
    .values({
      userId,
      workspaceId,
      label,
      hashedKey: hashed,
      keyHint: hint,
    })
    .returning({ id: apiKeys.id, createdAt: apiKeys.createdAt });

  await database.insert(auditEvents).values({
    actorUserId: userId,
    workspaceId,
    eventType: "api_key_created",
    metadata: { apiKeyId: record.id, label },
  });

  return {
    id: record.id,
    label,
    keyHint: hint,
    plaintext,
    createdAt: record.createdAt,
  };
}

export async function revokeApiKey(userId: string, keyId: string) {
  const database = getDbOrThrow();

  const [key] = await database
    .select({ id: apiKeys.id, workspaceId: apiKeys.workspaceId })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.userId, userId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .limit(1);

  if (!key) {
    return null;
  }

  await database
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, keyId));

  await database.insert(auditEvents).values({
    actorUserId: userId,
    workspaceId: key.workspaceId,
    eventType: "api_key_revoked",
    metadata: { apiKeyId: keyId },
  });

  return { id: keyId };
}
