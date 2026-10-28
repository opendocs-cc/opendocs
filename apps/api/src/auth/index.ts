import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";

import { siteConfig } from "@opendocs/shared/config/site";
import { db } from "@opendocs/shared/db";
import { authSchema } from "@opendocs/shared/db/schema";
import {
  sendEmail,
  passwordResetEmail,
  welcomeEmail,
} from "@opendocs/shared/email";
import { emailCodeOptions } from "@opendocs/shared/auth/email-code";
import { env } from "@opendocs/shared/env";
import { notifySignup } from "@opendocs/shared/notifications/telegram";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;
// Where the welcome email's "Open dashboard" CTA points. We prefer
// an explicit `WEB_APP_URL` env var (so prod / staging / preview
// each link to themselves) and fall back to the public-facing
// `siteConfig.url` for production-like environments without a
// per-env override set.
const webAppUrl = process.env.WEB_APP_URL ?? siteConfig.url;

const socialProviders = {
  ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
          redirectURI: `${apiUrl}/api/auth/callback/github`,
        },
      }
    : {}),
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          redirectURI: `${apiUrl}/api/auth/callback/google`,
        },
      }
    : {}),
};

if (!db) {
  throw new Error("DATABASE_URL is required to initialize authentication.");
}

function resolveAuthSecret() {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is required in production.");
  }

  return "opendocs-local-dev-auth-secret";
}

/** How an account was created, from the Better Auth endpoint that made it. */
function signupMethod(path?: string, params?: Record<string, string | undefined>) {
  if (!path) return null;
  if (path.includes("email-otp")) return "an emailed code";
  if (path === "/sign-up/email") return "email and password";
  if (path.startsWith("/callback")) {
    const provider = params?.id ?? path.split("/")[2];
    if (provider === "google") return "Google";
    if (provider === "github") return "GitHub";
    return provider ?? null;
  }
  return null;
}

export const auth = betterAuth({
  appName: "OpenDocs",
  baseURL: apiUrl,
  secret: resolveAuthSecret(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
    usePlural: false,
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your OpenDocs password",
        html: passwordResetEmail(url),
      });
    },
  },
  socialProviders,
  // Email sign-in codes: passwordless sign-in on the web and one-step
  // signup for agents via /api/v1/auth/code/*.
  plugins: [emailOTP(emailCodeOptions)],
  // Fires once per user, immediately after the row is created in
  // the `user` table. Covers both the email/password signup path
  // and the OAuth (GitHub / Google) one, which is exactly what we
  // want — every new account gets the welcome email regardless of
  // how they signed up.
  //
  // The hook is awaited but wrapped in try/catch so a Resend
  // outage / misconfigured `RESEND_API_KEY` can never block
  // signup. We log the failure for ops to follow up; there's no
  // retry queue here (a missed welcome email is low-stakes).
  //
  // It also tells the owner on Telegram, without waiting for it.
  databaseHooks: {
    user: {
      create: {
        after: async (user, ctx) => {
          void notifySignup({
            email: user.email,
            name: user.name,
            method: signupMethod(ctx?.path, ctx?.params),
          });
          try {
            await sendEmail({
              to: user.email,
              subject: "Welcome to OpenDocs",
              html: welcomeEmail({
                appUrl: webAppUrl,
                recipientName: user.name ?? null,
              }),
            });
          } catch (err) {
            console.error(
              "[auth] Failed to send welcome email — signup not affected:",
              err,
            );
          }
        },
      },
    },
  },
  ...(cookieDomain
    ? {
        advanced: {
          crossSubDomainCookies: {
            enabled: true,
            domain: cookieDomain,
          },
        },
      }
    : {}),
});
