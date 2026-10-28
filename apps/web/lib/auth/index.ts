import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, jwt } from "better-auth/plugins";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";

import { db } from "@opendocs/shared/db";
import { authSchema } from "@opendocs/shared/db/schema";
import {
  sendEmail,
  passwordResetEmail,
  welcomeEmail,
} from "@opendocs/shared/email";
import { emailCodeOptions } from "@opendocs/shared/auth/email-code";
import { env } from "@opendocs/shared/env";
import { OAUTH_SERVER_SCOPES, mcpResourceUrl } from "@opendocs/shared/mcp/config";

const socialProviders = {
  ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
          redirectURI: `${env.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/auth/callback/github`,
        },
      }
    : {}),
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          redirectURI: `${env.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/auth/callback/google`,
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

  // `next build` evaluates server modules while building the standalone
  // bundle. In Docker we intentionally do not pass production secrets into
  // the image build, so give Better Auth a non-runtime placeholder to avoid
  // its default-secret warning. The real secret is injected at container
  // runtime via deploy/.env.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return "opendocs-build-time-auth-secret-placeholder";
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is required in production.");
  }

  return "opendocs-local-dev-auth-secret";
}

const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;
const webAppUrl = env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  appName: "OpenDocs",
  baseURL: env.BETTER_AUTH_URL ?? "http://localhost:3000",
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
  plugins: [
    // Email sign-in codes: passwordless sign-in on the web and one-step
    // signup for agents via /api/v1/auth/code/*.
    emailOTP(emailCodeOptions),
    // OAuth 2.1 authorization server for the MCP server (mcp.opendocs.cc).
    // Access tokens are JWTs signed with the jwt plugin's keys and
    // audience-bound to the MCP resource; apps/api and apps/mcp verify them
    // against /api/auth/jwks. Claude, ChatGPT and VS Code register through
    // Client ID Metadata Documents (cimd); Cursor, Antigravity, Raycast and
    // older clients still use dynamic client registration.
    // No JWT on session responses: these keys only sign MCP access tokens.
    jwt({ disableSettingJwtHeader: true }),
    mcp({
      resource: mcpResourceUrl(),
      loginPage: "/login",
      consentPage: "/oauth/consent",
      scopes: [...OAUTH_SERVER_SCOPES],
      // People connecting apps, never machine-to-machine clients.
      grantTypes: ["authorization_code", "refresh_token"],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultApplicationType: "infer",
      accessTokenExpiresIn: 60 * 60,
      refreshTokenExpiresIn: 60 * 60 * 24 * 60,
    }),
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
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
