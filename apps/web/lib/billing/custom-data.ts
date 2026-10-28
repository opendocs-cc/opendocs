import { z } from "zod";

/**
 * Shape of the `custom_data` blob we attach to every Paddle transaction /
 * subscription we create. Paddle echoes this back verbatim in every
 * subsequent webhook event, which is how we link a Paddle subscription
 * back to the OpenDocs user (or workspace) that bought it.
 *
 * Keep this narrow — Paddle allows arbitrary JSON here, but the more we
 * stuff in the harder it is to migrate. Only the ids we strictly need
 * for lookup go in; everything else is fetched from the database at
 * webhook time.
 *
 * Validated through Zod because we're reading this back out of Paddle's
 * system. Even though we wrote it ourselves, an adversary with an API
 * key (e.g. a compromised staging env) could, in theory, send webhooks
 * with a malicious custom_data. We validate defensively regardless of
 * signature verification.
 */

export const userScopeCustomData = z.object({
  opendocsScope: z.literal("user"),
  userId: z.string().min(1),
});

export const workspaceScopeCustomData = z.object({
  opendocsScope: z.literal("workspace"),
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
});

export const opendocsCustomDataSchema = z.discriminatedUnion("opendocsScope", [
  userScopeCustomData,
  workspaceScopeCustomData,
]);

export type OpendocsCustomData = z.infer<typeof opendocsCustomDataSchema>;

/**
 * Best-effort parse. Returns null for anything unrecognized (legacy
 * transactions, webhooks triggered by Paddle admin actions, etc.) so the
 * handler can skip with a warning instead of crashing.
 */
export function parseOpendocsCustomData(
  input: unknown,
): OpendocsCustomData | null {
  const result = opendocsCustomDataSchema.safeParse(input);
  return result.success ? result.data : null;
}
