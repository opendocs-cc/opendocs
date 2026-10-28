import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { APIError } from "better-auth/api";

import { ensureAgentAccount } from "@opendocs/shared/agent-auth/service";
import { createApiKey } from "@opendocs/shared/api-keys/service";
import { EMAIL_CODE_EXPIRES_IN_SECONDS } from "@opendocs/shared/auth/email-code";
import { instanceWebUrl } from "@opendocs/shared/config/instance";
import { getDbOrThrow } from "@opendocs/shared/db/guards";
import { session, user } from "@opendocs/shared/db/schema";
import { auth } from "../auth/index";
import { readClient } from "../middleware/client";
import { codeRequestRateLimit, codeVerifyRateLimit } from "../middleware/rate-limit";
import { validateBody } from "../middleware/validate";

/**
 * Passwordless sign-in and signup for agents and the CLI, in two calls:
 *
 *   POST /api/v1/auth/code/request  { email }
 *     → emails a 6-digit code (valid 10 minutes)
 *   POST /api/v1/auth/code/verify   { email, code, keyName? }
 *     → creates the account if the email is new, finishes onboarding
 *       (username, workspace, default project) and returns a new API key
 *
 * The user only ever pastes the code from their inbox; the agent stores the
 * key. Built on Better Auth's email-OTP plugin so the web app's "email me
 * a code" sign-in shares the same codes and attempt limits.
 */

const router = Router();

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

const verifySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  code: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "The code is the 6 digits from the email.")),
  keyName: z.string().trim().min(1).max(100).optional(),
});

function signupsDisabled() {
  return process.env.SIGNUPS_DISABLED === "true";
}

async function userExists(email: string) {
  const database = getDbOrThrow();
  const [row] = await database
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1);
  return Boolean(row);
}

router.post(
  "/auth/code/request",
  codeRequestRateLimit,
  validateBody(requestSchema),
  async (req, res, next) => {
    try {
      const { email } = req.body as z.infer<typeof requestSchema>;
      const existing = await userExists(email);

      if (!existing && signupsDisabled()) {
        res.status(403).json({
          error: "signups_disabled",
          message: "New signups are temporarily closed. Existing accounts can still sign in.",
        });
        return;
      }

      await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });

      res.json({
        success: true,
        email,
        accountExists: existing,
        expiresInSeconds: EMAIL_CODE_EXPIRES_IN_SECONDS,
        message: `We sent a 6-digit sign-in code to ${email}. Ask the user to paste it, then call /api/v1/auth/code/verify.`,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/auth/code/verify",
  codeVerifyRateLimit,
  validateBody(verifySchema),
  async (req, res, next) => {
    try {
      const { email, code, keyName } = req.body as z.infer<typeof verifySchema>;
      const existedBefore = await userExists(email);

      let signedIn: { token: string; user: { id: string } };
      try {
        signedIn = await auth.api.signInEmailOTP({ body: { email, otp: code } });
      } catch (err) {
        if (err instanceof APIError) {
          const betterAuthCode = String((err.body as { code?: unknown } | undefined)?.code ?? "");
          if (betterAuthCode === "OTP_EXPIRED") {
            res.status(400).json({
              error: "code_expired",
              message: "That code has expired. Request a new one.",
            });
            return;
          }
          if (betterAuthCode === "TOO_MANY_ATTEMPTS") {
            res.status(429).json({
              error: "too_many_attempts",
              message: "Too many wrong codes. Request a new one.",
            });
            return;
          }
          res.status(400).json({
            error: "invalid_code",
            message: "That code is not valid for this email. Check the latest email or request a new code.",
          });
          return;
        }
        throw err;
      }

      // The CLI authenticates with the API key below; the browser session
      // Better Auth created as a side effect is not needed.
      await getDbOrThrow().delete(session).where(eq(session.token, signedIn.token));

      const userId = signedIn.user.id;
      const { onboarding, onboardingCreated } = await ensureAgentAccount(userId);
      if (!onboarding.workspace || !onboarding.username) {
        res.status(409).json({
          error: "onboarding_incomplete",
          message: `Your account has no workspace yet. Finish setup at ${instanceWebUrl()}/onboarding.`,
        });
        return;
      }

      const label = keyName ?? readClient(req) ?? "CLI";
      const key = await createApiKey(userId, onboarding.workspace.id, label);

      res.json({
        apiKey: key.plaintext,
        keyName: key.label,
        keyId: key.id,
        accountCreated: !existedBefore,
        onboardingCreated,
        userId,
        email,
        username: onboarding.username,
        workspace: {
          id: onboarding.workspace.id,
          slug: onboarding.workspace.slug,
          name: onboarding.workspace.name,
        },
        defaultProject: onboarding.workspace.defaultProject
          ? {
              id: onboarding.workspace.defaultProject.id,
              slug: onboarding.workspace.defaultProject.slug,
              name: onboarding.workspace.defaultProject.name,
            }
          : null,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
