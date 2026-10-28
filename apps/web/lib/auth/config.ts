import { env } from "@opendocs/shared/env";

export const authConfig = {
  appName: "OpenDocs",
  baseUrl: env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secretConfigured: Boolean(env.BETTER_AUTH_SECRET),
  providers: {
    github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    email: true,
    // Sign-in codes need email delivery (Resend); in development they go to
    // the dev outbox. A self-hosted instance without email uses passwords.
    emailCode: Boolean(env.RESEND_API_KEY) || process.env.NODE_ENV !== "production",
  },
} as const;
