import {
  boolean,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const createId = () => crypto.randomUUID();

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "member",
]);

export const visibilityEnum = pgEnum("post_visibility", [
  "private",
  "workspace",
  "restricted_email",
  "public",
]);

export const workspaceMemberStatusEnum = pgEnum("workspace_member_status", [
  "active",
  "invited",
  "disabled",
]);

export const billingPlanEnum = pgEnum("billing_plan", [
  "free",
  "pro",
  "team",
]);

// Paddle subscription lifecycle states, mirrored from
// https://developer.paddle.com/api-reference/subscriptions/overview#status.
// Stored as a Postgres enum so we fail loudly if Paddle adds a new value
// we haven't mapped. Entitlement checks treat "active" and "trialing" as
// paid; everything else falls back to the free tier.
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "trialing",
  "past_due",
  "paused",
  "canceled",
]);

export const billingCycleEnum = pgEnum("billing_cycle", [
  "monthly",
  "yearly",
]);

export const auditEventTypeEnum = pgEnum("audit_event_type", [
  "published",
  "updated",
  "unpublished",
  "deleted",
  "visibility_changed",
  "api_key_created",
  "api_key_revoked",
  "version_restored",
  "moved",
  "shared",
  "unshared",
  "claimed",
  "integration_connected",
  "integration_disconnected",
  "integration_settings_changed",
  "document_saved_to_storage",
  "signature_requested",
  "signature_sent",
  "signature_completed",
  "signature_cancelled",
]);

// Better Auth core tables
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  plan: billingPlanEnum("plan").default("free").notNull(),
  // Admin-assigned comp tier. When non-null, grants an additional
  // entitlement above the user's stored personal `plan`.
  // Supported values:
  //   - "friends": Founder access, Pro-tier personal limits.
  //   - "creator": internal full access, Team-tier limits without Paddle.
  // Set by the operator, directly in the database (there's no admin UI in
  // this repository) and never by a user-facing flow. Nullable because
  // most users aren't comped.
  compedTier: text("comped_tier"),
  dismissedTeamInviteOnboardingAt: timestamp("dismissed_team_invite_onboarding_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    tokenUnique: uniqueIndex("session_token_unique").on(table.token),
    userIndex: index("session_user_idx").on(table.userId),
  }),
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    providerAccountUnique: uniqueIndex("account_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
    userIndex: index("account_user_idx").on(table.userId),
  }),
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    identifierValueUnique: uniqueIndex("verification_identifier_value_unique").on(
      table.identifier,
      table.value,
    ),
  }),
);

// Better Auth OAuth 2.1 provider tables (jwt, @better-auth/oauth-provider via
// @better-auth/mcp, @better-auth/cimd). OpenDocs is the authorization server
// for the MCP server at mcp.opendocs.cc. Field names follow what the plugins
// expect (generated with the drizzle adapter's schema generator); see
// drizzle/0011_mcp_oauth.sql.
export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  alg: text("alg"),
  crv: text("crv"),
});

export const oauthClient = pgTable(
  "oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique("oauth_client_client_id_unique"),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    clientCredentialsScopes: text("client_credentials_scopes").array(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    requirePKCE: boolean("require_pkce"),
    dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => ({
    userIndex: index("oauth_client_user_idx").on(table.userId),
  }),
);

export const oauthResource = pgTable(
  "oauth_resource",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull().unique("oauth_resource_identifier_unique"),
    name: text("name").notNull(),
    accessTokenTtl: integer("access_token_ttl"),
    refreshTokenTtl: integer("refresh_token_ttl"),
    signingAlgorithm: text("signing_algorithm"),
    signingKeyId: text("signing_key_id"),
    allowedScopes: text("allowed_scopes").array(),
    customClaims: jsonb("custom_claims").$type<Record<string, unknown>>(),
    dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
    disabled: boolean("disabled").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    policyVersion: integer("policy_version").default(1),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
);

export const oauthClientResource = pgTable(
  "oauth_client_resource",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }),
  },
  (table) => ({
    clientResourceUnique: uniqueIndex("oauth_client_resource_client_resource_unique").on(
      table.clientId,
      table.resourceId,
    ),
    resourceIndex: index("oauth_client_resource_resource_idx").on(table.resourceId),
  }),
);

export const oauthRefreshToken = pgTable(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    revoked: timestamp("revoked", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: timestamp("rotation_replay_expires_at", { withTimezone: true }),
    authTime: timestamp("auth_time", { withTimezone: true }),
    confirmation: jsonb("confirmation").$type<Record<string, unknown>>(),
    scopes: text("scopes").array().notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("oauth_refresh_token_token_unique").on(table.token),
    clientIndex: index("oauth_refresh_token_client_idx").on(table.clientId),
    sessionIndex: index("oauth_refresh_token_session_idx").on(table.sessionId),
    userIndex: index("oauth_refresh_token_user_idx").on(table.userId),
    authorizationCodeIndex: index("oauth_refresh_token_authorization_code_idx").on(
      table.authorizationCodeId,
    ),
  }),
);

export const oauthAccessToken = pgTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token"),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    revoked: timestamp("revoked", { withTimezone: true }),
    confirmation: jsonb("confirmation").$type<Record<string, unknown>>(),
    scopes: text("scopes").array().notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("oauth_access_token_token_unique").on(table.token),
    clientIndex: index("oauth_access_token_client_idx").on(table.clientId),
    sessionIndex: index("oauth_access_token_session_idx").on(table.sessionId),
    userIndex: index("oauth_access_token_user_idx").on(table.userId),
    authorizationCodeIndex: index("oauth_access_token_authorization_code_idx").on(
      table.authorizationCodeId,
    ),
    refreshIndex: index("oauth_access_token_refresh_idx").on(table.refreshId),
  }),
);

export const oauthConsent = pgTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => ({
    clientIndex: index("oauth_consent_client_idx").on(table.clientId),
    userIndex: index("oauth_consent_user_idx").on(table.userId),
  }),
);

export const oauthClientAssertion = pgTable("oauth_client_assertion", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// OpenDocs tables
export const usernames = pgTable(
  "usernames",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    username: varchar("username", { length: 32 }).notNull(),
    normalizedUsername: varchar("normalized_username", { length: 32 }).notNull(),
    fullName: varchar("full_name", { length: 120 }),
    bio: text("bio"),
    profilePictureUrl: text("profile_picture_url"),
    isReserved: boolean("is_reserved").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    usernameUnique: uniqueIndex("usernames_normalized_username_unique").on(table.normalizedUsername),
    userUnique: uniqueIndex("usernames_user_id_unique").on(table.userId),
  }),
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 64 }).notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Legacy workspace-scoped billing plan. "free" and "team" are the only
    // values that make sense here — Pro is a per-user plan and lives on
    // user.plan. New Team subscriptions are user-scoped too; this column
    // remains for existing workspace-scoped Team rows while entitlement
    // helpers migrate callers to subscription-aware checks.
    plan: billingPlanEnum("plan").default("free").notNull(),
    defaultVisibility: visibilityEnum("default_visibility").default("workspace").notNull(),
    /**
     * Default ordering for the workspace profile's article list.
     * Stored as a varchar (not a Postgres enum) so adding a new
     * sort option is a TypeScript change in
     * `packages/shared/src/posts/sort.ts` rather than a separate
     * enum-alter migration. Application code validates against
     * `POST_SORT_VALUES` before passing to the DB layer.
     */
    defaultSort: varchar("default_sort", { length: 32 }).default("recently-updated").notNull(),
    allowPublicDocuments: boolean("allow_public_documents").default(false).notNull(),
    bio: text("bio"),
    // Doc-converter's "opendocs" theme accent (Purple 950). Matches the
    // "Purple" preset in the workspace-settings picker and produces a
    // calm, dark-purple accent in rendered PDFs/DOCXs. The previous
    // bright Tailwind-600 default (#7F56D9) read as garish in long-form
    // documents, which is why the converter's palette docs recommend
    // 800/900/950 shades across the board. See doc-converter/app/themes.py.
    brandColor: varchar("brand_color", { length: 7 }).default("#2E1C5C").notNull(),
    logoUrl: text("logo_url"),
    showLogoInExports: boolean("show_logo_in_exports").default(true).notNull(),

    // PDF export defaults.
    //
    // All fields below are nullable overrides: `null` means "use the
    // converter's default". The converter already has OpenDocs-branded
    // defaults baked in, so an unconfigured workspace gets a sensible
    // export out of the box. The fields get merged into the converter's
    // `branding` payload in apps/api/src/routes/posts.ts at export time.
    //
    // `exportFontMain` — picked from a whitelist in validation.ts. Kept
    //   as a free-form varchar here so we can add fonts later without
    //   writing an enum migration.
    // `exportFooterEnabled` — master switch. When false we pass empty
    //   strings to the converter so the entire footer paragraph renders
    //   blank. Defaults true.
    // `exportFooterCompanyName` — line 1 override. Null falls back to
    //   `workspaces.name` at export time.
    // `exportFooterTagline`, `exportFooterLinkUrl`,
    //   `exportFooterLinkLabel` — line 2 bits (tagline – URL).
    exportFontMain: varchar("export_font_main", { length: 64 }),
    exportFooterEnabled: boolean("export_footer_enabled").default(true).notNull(),
    exportFooterCompanyName: varchar("export_footer_company_name", { length: 120 }),
    exportFooterTagline: varchar("export_footer_tagline", { length: 120 }),
    exportFooterLinkUrl: text("export_footer_link_url"),
    exportFooterLinkLabel: varchar("export_footer_link_label", { length: 120 }),

    // Integrations (packages/shared/src/integrations). Varchars validated
    // in code, like defaultSort.
    // `integrationsUsableBy` — who may save to Drive and request
    //   signatures: "members" (everyone) or "admins". Connecting and
    //   managing integrations is always owner/admin.
    // `signatureConfirmation` — "chat": an agent may send a signature
    //   request after the user confirms in chat; "browser": only a
    //   signed-in person can send, from the approval page.
    integrationsUsableBy: varchar("integrations_usable_by", { length: 16 }).default("members").notNull(),
    signatureConfirmation: varchar("signature_confirmation", { length: 16 }).default("chat").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugUnique: uniqueIndex("workspaces_slug_unique").on(table.slug),
  }),
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 64 }).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceSlugUnique: uniqueIndex("projects_workspace_slug_unique").on(
      table.workspaceId,
      table.slug,
    ),
    workspaceDefaultIdx: index("projects_workspace_default_idx").on(
      table.workspaceId,
      table.isDefault,
    ),
    workspaceIndex: index("projects_workspace_idx").on(table.workspaceId),
  }),
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").default("member").notNull(),
    status: workspaceMemberStatusEnum("status").default("active").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    membershipUnique: uniqueIndex("workspace_members_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
    // Reverse-direction lookup: "give me every workspace this user
    // is an active member of." Hit on every authenticated request
    // for sidebar / access-control checks (`getViewerWorkspaceIds`,
    // `getUserWorkspaces`). Without this, the ORM falls back to
    // scanning rows by user_id from the unique index — fine for a
    // handful of memberships, but a sequential scan once a user is
    // in many workspaces.
    userStatusWorkspaceIdx: index("workspace_members_user_status_workspace_idx").on(
      table.userId,
      table.status,
      table.workspaceId,
    ),
    // Workspace-scoped admin / role checks: team listings, owner
    // counts, role gates. The unique index above answers
    // "membership exists?" but not "how many active admins does
    // this workspace have?" — that's a workspace_id + status +
    // role filter, served by this composite.
    workspaceStatusRoleIdx: index("workspace_members_workspace_status_role_idx").on(
      table.workspaceId,
      table.status,
      table.role,
    ),
  }),
);

export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    role: membershipRoleEnum("role").default("member").notNull(),
    token: text("token").notNull(),
    invitedByUserId: text("invited_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("workspace_invitations_token_unique").on(table.token),
    workspaceEmailUnique: uniqueIndex("workspace_invitations_workspace_email_unique").on(
      table.workspaceId,
      table.email,
    ),
    // Pending-invites listing on the team settings page filters by
    // `workspace_id` AND `expires_at > now()`. The unique index
    // above handles uniqueness writes but doesn't help with the
    // expiry filter scan; this composite does.
    workspaceExpiresIdx: index("workspace_invitations_workspace_expires_idx").on(
      table.workspaceId,
      table.expiresAt,
    ),
  }),
);

export const workspaceDomains = pgTable(
  "workspace_domains",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    domain: varchar("domain", { length: 255 }).notNull(),
    isVerified: boolean("is_verified").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceDomainUnique: uniqueIndex("workspace_domains_workspace_domain_unique").on(
      table.workspaceId,
      table.domain,
    ),
  }),
);

// A workspace's own domain for its reader pages, e.g. notes.example.com
// instead of opendocs.cc/<workspace> (packages/shared/src/custom-domains).
// Not to be confused with `workspace_domains` above, which holds email
// domains for auto-join.
//
// `status` is the DNS state only: "pending" until the TXT and CNAME (or A)
// records check out, "active" once they do, "misconfigured" after
// CUSTOM_DOMAIN_FAILURE_LIMIT scheduled checks in a row failed. Whether an
// active domain serves also depends on the plan, which is read at request
// time, so a downgrade pauses the domain and an upgrade restores it.
//
// One domain per workspace (unique workspace_id). A hostname can sit in
// several rows while it's being claimed, but only one can be active.
export const workspaceCustomDomains = pgTable(
  "workspace_custom_domains",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // Lowercase, punycode (xn--) for non-ASCII names, no trailing dot.
    hostname: varchar("hostname", { length: 253 }).notNull(),
    status: varchar("status", { length: 20 })
      .$type<"pending" | "active" | "misconfigured">()
      .default("pending")
      .notNull(),
    // The value of the TXT record at _opendocs.<hostname> is
    // `opendocs-verify=<verification_token>`.
    verificationToken: text("verification_token").notNull(),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    // Code of the first record that failed the last check (see
    // CustomDomainErrorCode), null when it passed.
    lastError: varchar("last_error", { length: 40 }),
    // Per-record outcome of the last check, for the settings card.
    lastCheck: jsonb("last_check").$type<Record<string, unknown>>(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    // Start of the current run of failed checks; null while checks pass.
    failingSince: timestamp("failing_since", { withTimezone: true }),
    // The "Published with OpenDocs" line in the domain's footer. On by
    // default; owners and admins can hide it for a white-label site.
    showPoweredBy: boolean("show_powered_by").default(true).notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceUnique: uniqueIndex("workspace_custom_domains_workspace_unique").on(table.workspaceId),
    hostnameIdx: index("workspace_custom_domains_hostname_idx").on(table.hostname),
    activeHostnameUnique: uniqueIndex("workspace_custom_domains_active_hostname_unique")
      .on(table.hostname)
      .where(sql`${table.status} = 'active'`),
  }),
);

// Sign-in on custom domains (phase 2). The opendocs.cc session cookie is
// never sent to a customer's domain, so readers get a separate, host-only
// viewer session through a short redirect via opendocs.cc/auth/bridge:
// that route mints a one-time code (this table, stored hashed, 60 seconds,
// single use, bound to the user, the hostname and the `state` the custom
// host set in its own cookie), and the custom host's /_opendocs/session
// exchanges it for a row in custom_domain_sessions.
//
// Both tables reference the opendocs.cc session they came from, so signing
// out there (Better Auth deletes the row) or revoking sessions revokes the
// viewer sessions too; removing the domain deletes them through domain_id.
export const customDomainBridgeCodes = pgTable(
  "custom_domain_bridge_codes",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    codeHash: text("code_hash").notNull(),
    stateHash: text("state_hash").notNull(),
    // Foreign key below, named (the generated name is too long).
    domainId: text("domain_id").notNull(),
    hostname: varchar("hostname", { length: 253 }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceSessionId: text("source_session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    // Where the reader goes after signing in: a path on the custom domain.
    returnPath: text("return_path").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    domainFk: foreignKey({
      name: "custom_domain_bridge_codes_domain_fk",
      columns: [table.domainId],
      foreignColumns: [workspaceCustomDomains.id],
    }).onDelete("cascade"),
    codeHashUnique: uniqueIndex("custom_domain_bridge_codes_code_hash_unique").on(table.codeHash),
    expiresAtIdx: index("custom_domain_bridge_codes_expires_at_idx").on(table.expiresAt),
    // Foreign keys with ON DELETE cascade: sign-outs, account deletions and
    // domain removals delete matching rows without scanning the table.
    domainIdx: index("custom_domain_bridge_codes_domain_idx").on(table.domainId),
    userIdx: index("custom_domain_bridge_codes_user_idx").on(table.userId),
    sourceSessionIdx: index("custom_domain_bridge_codes_source_session_idx").on(table.sourceSessionId),
  }),
);

// Viewer sessions on custom domains. They can read and comment, nothing
// else: every other change happens on opendocs.cc. The cookie holds a
// random token; only its hash is stored.
export const customDomainSessions = pgTable(
  "custom_domain_sessions",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    tokenHash: text("token_hash").notNull(),
    // Foreign key below, named (the generated name is too long).
    domainId: text("domain_id").notNull(),
    hostname: varchar("hostname", { length: 253 }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceSessionId: text("source_session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    domainFk: foreignKey({
      name: "custom_domain_sessions_domain_fk",
      columns: [table.domainId],
      foreignColumns: [workspaceCustomDomains.id],
    }).onDelete("cascade"),
    tokenHashUnique: uniqueIndex("custom_domain_sessions_token_hash_unique").on(table.tokenHash),
    userIdx: index("custom_domain_sessions_user_idx").on(table.userId),
    expiresAtIdx: index("custom_domain_sessions_expires_at_idx").on(table.expiresAt),
    domainIdx: index("custom_domain_sessions_domain_idx").on(table.domainId),
    sourceSessionIdx: index("custom_domain_sessions_source_session_idx").on(table.sourceSessionId),
  }),
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    label: varchar("label", { length: 100 }).notNull(),
    hashedKey: text("hashed_key").notNull(),
    keyHint: varchar("key_hint", { length: 8 }).default("").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    hashedKeyUnique: uniqueIndex("api_keys_hashed_key_unique").on(table.hashedKey),
  }),
);

export const cliLoginRequests = pgTable(
  "cli_login_requests",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    stateHash: text("state_hash").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    apiUrl: text("api_url").notNull(),
    clientName: varchar("client_name", { length: 100 }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    authCodeHash: text("auth_code_hash"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    stateHashUnique: uniqueIndex("cli_login_requests_state_hash_unique").on(table.stateHash),
    authCodeHashUnique: uniqueIndex("cli_login_requests_auth_code_hash_unique").on(
      table.authCodeHash,
    ),
    expiresAtIndex: index("cli_login_requests_expires_at_idx").on(table.expiresAt),
  }),
);

// One row per (user, OAuth client) connection to the MCP server: the
// defaults the user picked on the consent screen (workspace, project,
// organise mode) and revocation. Access tokens are stateless JWTs, so
// "Disconnect" sets tokens_valid_after; the API rejects tokens issued
// before it.
export const mcpConnections = pgTable(
  "mcp_connections",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    clientName: varchar("client_name", { length: 200 }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    // ask | auto | off — same meaning as the CLI's `config set organize`.
    organize: varchar("organize", { length: 8 }).default("ask").notNull(),
    tokensValidAfter: timestamp("tokens_valid_after", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userClientUnique: uniqueIndex("mcp_connections_user_client_unique").on(
      table.userId,
      table.clientId,
    ),
  }),
);

// Short-lived download links handed to chat clients instead of file bytes
// (exports, signature PDFs). The token is shown once; only its hash is
// stored. Access is re-checked when the link is opened.
export const downloadLinks = pgTable(
  "download_links",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    tokenHash: text("token_hash").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // post_export | batch_export | signature_document
    kind: varchar("kind", { length: 30 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    filename: varchar("filename", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    downloadCount: integer("download_count").default(0).notNull(),
    lastDownloadedAt: timestamp("last_downloaded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("download_links_token_hash_unique").on(table.tokenHash),
    expiresAtIndex: index("download_links_expires_at_idx").on(table.expiresAt),
  }),
);

export const posts = pgTable(
  "posts",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    usernameId: text("username_id")
      .references(() => usernames.id, { onDelete: "restrict" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 160 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    summary: text("summary"),
    visibility: visibilityEnum("visibility").default("workspace").notNull(),
    currentVersionId: text("current_version_id"),
    isPublished: boolean("is_published").default(true).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Post slugs are unique within a project. Default-project posts keep the
    // short /{workspace}/{slug} URL, while non-default projects use
    // /{workspace}/projects/{project}/{slug}.
    projectSlugUnique: uniqueIndex("posts_project_slug_unique").on(table.projectId, table.slug),
    workspaceIndex: index("posts_workspace_idx").on(table.workspaceId),
    projectIndex: index("posts_project_idx").on(table.projectId),
    // Non-unique index for slug-based lookups from the CLI: `opendocs get <slug>`,
    // `opendocs pull <slug>`, etc. Scoped by authorUserId so each user's slug
    // namespace is effectively unique within a single workspace.
    authorSlugIndex: index("posts_author_slug_idx").on(table.authorUserId, table.slug),
    // Workspace-profile listing — the hottest read path. Filters by
    // `workspace_id + is_published` and orders by `updated_at DESC`
    // (the default sort). This composite lets Postgres serve the
    // first page of results from an index-ordered scan rather than
    // a filter-then-sort over every post in the workspace.
    projectPublishedUpdatedIdx: index("posts_project_published_updated_idx").on(
      table.projectId,
      table.isPublished,
      table.updatedAt.desc(),
    ),
    // Same workspace-profile listing, but for the "Recently added"
    // sort variant. Falls back to a sort-over-result-set without
    // this; cheap to add since the table already has the supporting
    // columns.
    projectPublishedAddedIdx: index("posts_project_published_added_idx").on(
      table.projectId,
      table.isPublished,
      table.publishedAt.desc(),
    ),
  }),
);

export const postVersions = pgTable(
  "post_versions",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    rawMarkdown: text("raw_markdown").notNull(),
    renderedHtml: text("rendered_html").notNull(),
    toc: jsonb("toc").$type<
      Array<{
        id: string;
        text: string;
        level: number;
      }>
    >(),
    sourceMetadata: jsonb("source_metadata").$type<Record<string, unknown>>(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    versionUnique: uniqueIndex("post_versions_post_id_version_number_unique").on(
      table.postId,
      table.versionNumber,
    ),
  }),
);

export const postTags = pgTable(
  "post_tags",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    postTagUnique: uniqueIndex("post_tags_post_id_tag_unique").on(table.postId, table.tag),
    // Reverse-direction lookup: "give me every post carrying this
    // tag." Used by the `/[workspace]/tag/[tag]` page filter and
    // by `getRelatedPostsByTags` (article sidebar). The unique
    // index above is `(post_id, tag)` and doesn't help when the
    // leading filter is the tag string.
    tagPostIdx: index("post_tags_tag_post_idx").on(table.tag, table.postId),
  }),
);

export const postRestrictedEmails = pgTable(
  "post_restricted_emails",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    ruleType: varchar("rule_type", { length: 20 }).notNull(),
    value: varchar("value", { length: 320 }).notNull(),
    addedByUserId: text("added_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    postRestrictionUnique: uniqueIndex("post_restricted_emails_post_id_value_unique").on(
      table.postId,
      table.value,
    ),
  }),
);

// Documents published without an account. They live outside `posts` on
// purpose: no author, workspace or project, readable by anyone holding the
// unguessable `id` link, and deleted after `expires_at` (24 hours). The
// creator keeps a one-time claim token (stored hashed) that moves the doc
// into a real workspace as a normal post. See packages/shared/src/anonymous.
export const anonymousDocs = pgTable(
  "anonymous_docs",
  {
    id: text("id").primaryKey(),
    claimTokenHash: text("claim_token_hash").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    summary: text("summary"),
    rawMarkdown: text("raw_markdown").notNull(),
    renderedHtml: text("rendered_html").notNull(),
    toc: jsonb("toc").$type<
      Array<{
        id: string;
        text: string;
        level: number;
      }>
    >(),
    client: varchar("client", { length: 64 }),
    // Set when enough readers reported the page (FREE_TOOL_LIMITS.reports);
    // the page shows a "hidden pending review" notice until the owner
    // restores it or it expires.
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    claimTokenHashUnique: uniqueIndex("anonymous_docs_claim_token_hash_unique").on(
      table.claimTokenHash,
    ),
    expiresAtIndex: index("anonymous_docs_expires_at_idx").on(table.expiresAt),
  }),
);

// Readers' reports on anonymous pages ("Report this page" on /a/<id>). One
// row per page and reporter; `reporter_hash` is an HMAC of the reporter's
// address (IPv6 by /56), so distinct reporters can be counted without
// storing addresses. Deleted with the page.
export const anonymousDocReports = pgTable(
  "anonymous_doc_reports",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    anonymousDocId: text("anonymous_doc_id")
      .notNull()
      .references(() => anonymousDocs.id, { onDelete: "cascade" }),
    reporterHash: text("reporter_hash").notNull(),
    reason: varchar("reason", { length: 32 }).notNull(),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    docReporterUnique: uniqueIndex("anonymous_doc_reports_doc_reporter_unique").on(
      table.anonymousDocId,
      table.reporterHash,
    ),
  }),
);

export const auditEvents = pgTable("audit_events", {
  id: text("id").$defaultFn(createId).primaryKey(),
  actorUserId: text("actor_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  postId: text("post_id").references(() => posts.id, {
    onDelete: "set null",
  }),
  eventType: auditEventTypeEnum("event_type").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Paddle subscriptions. One row per active-or-recently-canceled Paddle
// subscription. The scope column says who this subscription belongs to:
//   - "user"       → personal Pro or Team plan; userId set, workspaceId null
//   - "workspace"  → legacy Team plan; workspaceId set, userId is purchaser
// Both ids are kept even for legacy workspace subs so we can attribute the
// purchase back to the human who paid and show it in their receipts UI.
//
// We lazily upsert on Paddle webhook events keyed by paddleSubscriptionId.
// The canonical state lives in Paddle — this table is our cache for fast
// entitlement checks and the customer-portal lookup. When the cache is
// stale (e.g. during webhook processing delays) the webhook retry will
// converge it; we never rely on this as a source of truth for money.
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    plan: billingPlanEnum("plan").notNull(),
    paddleCustomerId: text("paddle_customer_id").notNull(),
    paddleSubscriptionId: text("paddle_subscription_id").notNull(),
    // Which Paddle the subscription lives in. A server only counts rows
    // from the environment its BILLING_MODE points at, so a sandbox test
    // left in the production database grants nothing.
    environment: varchar("environment", { length: 16 }).$type<"sandbox" | "production">().default("production").notNull(),
    paddlePriceId: text("paddle_price_id").notNull(),
    // The discount Paddle has on the subscription right now (`dsc_…`),
    // null for none.
    paddleDiscountId: text("paddle_discount_id"),
    // Set the first time the subscription carries the founder discount and
    // never cleared. Paddle drops the discount while a founder is on Team;
    // switching back to Pro puts it back. See billing/founder-offer.ts.
    foundingMember: boolean("founding_member").default(false).notNull(),
    billingCycle: billingCycleEnum("billing_cycle").notNull(),
    status: subscriptionStatusEnum("status").notNull(),
    // Seat count — always 1 for Pro, 3+ for Team. Paddle enforces the
    // minimum natively via quantity.minimum on the price; we store the
    // resolved quantity here so the UI can render "5 seats × $4/mo" etc.
    seats: integer("seats").default(1).notNull(),
    // Quantity of the recurring "Extra Pro Workspace" add-on attached to
    // a Pro subscription. Base Pro includes two owned workspaces; each
    // add-on unit grants one more owned workspace.
    extraWorkspaces: integer("extra_workspaces").default(0).notNull(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    paddleSubscriptionUnique: uniqueIndex(
      "subscriptions_paddle_subscription_id_unique",
    ).on(table.paddleSubscriptionId),
    userIndex: index("subscriptions_user_idx").on(table.userId),
    workspaceIndex: index("subscriptions_workspace_idx").on(table.workspaceId),
    customerIndex: index("subscriptions_paddle_customer_idx").on(
      table.paddleCustomerId,
    ),
    // Entitlement / billing-tier checks for the active user. Hit on
    // every page render to gate Pro / Team features in the
    // sidebar, exports, etc. The `userIndex` above gives us "all
    // subs for this user" but every check filters down to active
    // ones afterwards in app code; pushing the status filter into
    // the index lets the query short-circuit at the storage layer.
    userStatusIdx: index("subscriptions_user_status_idx").on(
      table.userId,
      table.status,
    ),
  }),
);

// Raw Paddle webhook event log. Every verified webhook is stored here
// before any business logic runs — that gives us three things:
//
//   1. Idempotency: Paddle retries for up to 3 days with the same event_id
//      on non-2xx. Inserting with ON CONFLICT (event_id) DO NOTHING makes
//      duplicate delivery a no-op.
//   2. Replay: if the handler is buggy we can fix the code and re-run
//      processing against the raw payload without asking Paddle to resend.
//   3. Audit: proves what Paddle actually told us, signed and timestamped,
//      if a customer ever disputes a charge or cancellation.
//
// The handler inserts → returns 200 → processes async. `processedAt` marks
// the event as applied to the domain model; `processingError` captures the
// last failure reason for retry / debugging.
export const paddleWebhookEvents = pgTable(
  "paddle_webhook_events",
  {
    // Paddle's own event_id (evt_...). Used as the primary key so the
    // unique-violation on duplicate delivery is atomic.
    eventId: text("event_id").primaryKey(),
    // Paddle's notification_id (ntf_...). Same event_id can be delivered
    // under multiple notification_ids during retry — we keep the latest.
    notificationId: text("notification_id").notNull(),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingError: text("processing_error"),
  },
  (table) => ({
    eventTypeIndex: index("paddle_webhook_events_event_type_idx").on(table.eventType),
    receivedAtIndex: index("paddle_webhook_events_received_at_idx").on(
      table.receivedAt,
    ),
  }),
);

// Inline discussion threads on a published post. Workspace members
// can leave comments anchored either to a specific text selection
// (quoted excerpt + offsets + before/after fingerprints) or to the
// whole post (anchor columns left null). Replies are modeled with
// `parentCommentId` self-reference; only top-level comments carry
// an anchor — replies inherit their parent's range and are rendered
// as a thread underneath.
//
// Anchor resilience across versions: when a post is republished the
// raw markdown can shift, so the rendered text offsets we captured
// at comment time may no longer point at the same characters. The
// client tries `start_offset`/`end_offset` first, then falls back to
// fuzzy-locating `quoted_text` using `anchor_before`/`anchor_after`
// as bracketing context. If both fail the comment is shown at the
// top of the sidebar as "orphaned" with the original quote intact.
export const comments = pgTable(
  "comments",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    // Self-reference for threaded replies. Top-level comments leave
    // this null. Reply chains are flat (one level deep) — the UI
    // doesn't render reply-to-reply nesting.
    parentCommentId: text("parent_comment_id"),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    // The exact substring of the rendered article that the comment
    // was attached to. Null for general post-level comments and for
    // replies (which inherit their parent's anchor).
    quotedText: text("quoted_text"),
    // ~30 chars of plain text immediately before/after the selection.
    // Used as a fingerprint to re-locate the selection if the
    // document is updated and offsets shift.
    anchorBefore: text("anchor_before"),
    anchorAfter: text("anchor_after"),
    // Character offsets into the rendered article's plain text at
    // comment time. Cheap fast-path for the highlighter; falls back
    // to fingerprint matching if the offsets miss.
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    postIndex: index("comments_post_idx").on(table.postId),
    threadIndex: index("comments_thread_idx").on(
      table.postId,
      table.parentCommentId,
    ),
  }),
);

// ---- Integrations ---------------------------------------------------------
//
// Workspace-scoped connections to outside services (Google Drive, DocuSeal,
// later others). See packages/shared/src/integrations/.

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// One connection per provider per workspace. `config` holds non-secret
// settings (DocuSeal region/base URL, the Google account); `credentials`
// holds secrets encrypted with INTEGRATIONS_ENCRYPTION_KEY (never sent to
// clients).
export const workspaceIntegrations = pgTable(
  "workspace_integrations",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    // "connected" or "error" (credentials stopped working; reconnect).
    status: varchar("status", { length: 20 }).default("connected").notNull(),
    accountLabel: varchar("account_label", { length: 255 }),
    config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
    credentials: text("credentials").notNull(),
    lastError: text("last_error"),
    connectedByUserId: text("connected_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceProviderUnique: uniqueIndex("workspace_integrations_workspace_provider_unique").on(
      table.workspaceId,
      table.provider,
    ),
  }),
);

// Named places to save documents, e.g. a Drive folder called
// "Board Minutes". Agents refer to them by name.
export const integrationDestinations = pgTable(
  "integration_destinations",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // Foreign key below: the generated name is over Postgres's 63 characters.
    integrationId: text("integration_id").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    externalId: text("external_id").notNull(),
    externalName: varchar("external_name", { length: 255 }),
    driveId: text("drive_id"),
    driveName: varchar("drive_name", { length: 255 }),
    url: text("url"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    integrationFk: foreignKey({
      name: "integration_destinations_integration_fk",
      columns: [table.integrationId],
      foreignColumns: [workspaceIntegrations.id],
    }).onDelete("cascade"),
    workspaceIdx: index("integration_destinations_workspace_idx").on(table.workspaceId),
    integrationNameUnique: uniqueIndex("integration_destinations_integration_name_unique").on(
      table.integrationId,
      table.name,
    ),
  }),
);

// Append-only record of every file an integration stored: who asked, from
// which client, which document version, and the hashes on both sides.
export const integrationRuns = pgTable(
  "integration_runs",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    integrationId: text("integration_id").references(() => workspaceIntegrations.id, {
      onDelete: "set null",
    }),
    provider: varchar("provider", { length: 40 }).notNull(),
    action: varchar("action", { length: 40 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    postId: text("post_id").references(() => posts.id, { onDelete: "set null" }),
    postVersionNumber: integer("post_version_number"),
    signatureRequestId: text("signature_request_id"),
    destinationId: text("destination_id").references(() => integrationDestinations.id, {
      onDelete: "set null",
    }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    authMethod: varchar("auth_method", { length: 20 }),
    client: varchar("client", { length: 120 }),
    request: jsonb("request").$type<Record<string, unknown>>(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceCreatedIdx: index("integration_runs_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    postIdx: index("integration_runs_post_idx").on(table.postId),
  }),
);

// A request to sign one document version. Starts as a draft holding the
// exact PDF that will be sent (and its SHA-256), so what the user confirms
// is byte-for-byte what signers receive.
export const signatureRequests = pgTable(
  "signature_requests",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    integrationId: text("integration_id").references(() => workspaceIntegrations.id, {
      onDelete: "set null",
    }),
    provider: varchar("provider", { length: 40 }).notNull(),
    postId: text("post_id").references(() => posts.id, { onDelete: "set null" }),
    postVersionNumber: integer("post_version_number").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    // draft | sending | pending | completed | declined | expired | cancelled | failed
    status: varchar("status", { length: 20 }).default("draft").notNull(),
    signingOrder: varchar("signing_order", { length: 20 }).default("sequential").notNull(),
    message: jsonb("message").$type<{ subject?: string; body?: string }>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    documentName: varchar("document_name", { length: 255 }).notNull(),
    documentSha256: varchar("document_sha256", { length: 64 }).notNull(),
    // The draft PDF. Cleared once the provider has it.
    documentPdf: bytea("document_pdf"),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    // Foreign key below, named (the generated name is too long).
    fileToDestinationId: text("file_to_destination_id"),
    filed: jsonb("filed").$type<Record<string, unknown>>(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdVia: varchar("created_via", { length: 20 }),
    client: varchar("client", { length: 120 }),
    confirmedByUserId: text("confirmed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // "chat" (agent sent it after the user confirmed in chat) or "browser".
    confirmedVia: varchar("confirmed_via", { length: 20 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    fileToFk: foreignKey({
      name: "signature_requests_file_to_destination_fk",
      columns: [table.fileToDestinationId],
      foreignColumns: [integrationDestinations.id],
    }).onDelete("set null"),
    workspaceCreatedIdx: index("signature_requests_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    postIdx: index("signature_requests_post_idx").on(table.postId),
    externalIdx: index("signature_requests_external_idx").on(table.provider, table.externalId),
  }),
);

export const signatureSigners = pgTable(
  "signature_signers",
  {
    id: text("id").$defaultFn(createId).primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => signatureRequests.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    role: varchar("role", { length: 60 }).notNull(),
    signingOrder: integer("signing_order").notNull(),
    // draft | awaiting | sent | opened | completed | declined
    status: varchar("status", { length: 20 }).default("draft").notNull(),
    externalId: text("external_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    declineReason: text("decline_reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    requestIdx: index("signature_signers_request_idx").on(table.requestId),
  }),
);

export const authSchema = {
  user,
  session,
  account,
  verification,
  jwks,
  oauthClient,
  oauthResource,
  oauthClientResource,
  oauthRefreshToken,
  oauthAccessToken,
  oauthConsent,
  oauthClientAssertion,
};
