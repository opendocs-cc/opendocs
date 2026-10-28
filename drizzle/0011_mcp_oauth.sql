-- MCP server (mcp.opendocs.cc) and OAuth 2.1: opendocs.cc becomes the
-- authorization server through Better Auth's jwt, @better-auth/mcp
-- (oauth-provider) and @better-auth/cimd plugins. Their tables are the
-- jwks .. oauth_client_assertion block below; field names are what the
-- plugins expect.
--
-- mcp_connections holds per-connection defaults (workspace, project,
-- organise mode) and the revocation cut-off for stateless access tokens.
-- download_links backs the expiring links MCP tools return instead of
-- file bytes.
--
-- Run before deploying the code that uses it. Every statement is
-- idempotent; run with psql -f. Constraint and index names match what
-- drizzle-kit generates from schema.ts.

CREATE TABLE IF NOT EXISTS "jwks" (
  "id" text PRIMARY KEY NOT NULL,
  "public_key" text NOT NULL,
  "private_key" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone,
  "alg" text,
  "crv" text
);

CREATE TABLE IF NOT EXISTS "oauth_client" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL,
  "client_secret" text,
  "client_discovery_id" text,
  "disabled" boolean DEFAULT false,
  "skip_consent" boolean,
  "enable_end_session" boolean,
  "subject_type" text,
  "scopes" text[],
  "client_credentials_scopes" text[],
  "user_id" text,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "name" text,
  "uri" text,
  "icon" text,
  "contacts" text[],
  "tos" text,
  "policy" text,
  "software_id" text,
  "software_version" text,
  "software_statement" text,
  "redirect_uris" text[] NOT NULL,
  "post_logout_redirect_uris" text[],
  "backchannel_logout_uri" text,
  "backchannel_logout_session_required" boolean,
  "token_endpoint_auth_method" text,
  "application_type" text,
  "jwks" text,
  "jwks_uri" text,
  "grant_types" text[],
  "response_types" text[],
  "require_pkce" boolean,
  "dpop_bound_access_tokens" boolean DEFAULT false,
  "reference_id" text,
  "metadata" jsonb,
  CONSTRAINT "oauth_client_client_id_unique" UNIQUE("client_id"),
  CONSTRAINT "oauth_client_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS "oauth_client_user_idx" ON "oauth_client" ("user_id");

CREATE TABLE IF NOT EXISTS "oauth_resource" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "name" text NOT NULL,
  "access_token_ttl" integer,
  "refresh_token_ttl" integer,
  "signing_algorithm" text,
  "signing_key_id" text,
  "allowed_scopes" text[],
  "custom_claims" jsonb,
  "dpop_bound_access_tokens_required" boolean DEFAULT false,
  "disabled" boolean DEFAULT false,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  "policy_version" integer DEFAULT 1,
  "metadata" jsonb,
  CONSTRAINT "oauth_resource_identifier_unique" UNIQUE("identifier")
);

CREATE TABLE IF NOT EXISTS "oauth_client_resource" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL,
  "resource_id" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone,
  CONSTRAINT "oauth_client_resource_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade,
  CONSTRAINT "oauth_client_resource_resource_id_oauth_resource_identifier_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."oauth_resource"("identifier") ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_client_resource_client_resource_unique" ON "oauth_client_resource" ("client_id","resource_id");
CREATE INDEX IF NOT EXISTS "oauth_client_resource_resource_idx" ON "oauth_client_resource" ("resource_id");

CREATE TABLE IF NOT EXISTS "oauth_refresh_token" (
  "id" text PRIMARY KEY NOT NULL,
  "token" text NOT NULL,
  "client_id" text NOT NULL,
  "session_id" text,
  "user_id" text NOT NULL,
  "reference_id" text,
  "authorization_code_id" text,
  "resources" text[],
  "requested_user_info_claims" text[],
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone,
  "revoked" timestamp with time zone,
  "rotated_at" timestamp with time zone,
  "rotation_replay_response" text,
  "rotation_replay_expires_at" timestamp with time zone,
  "auth_time" timestamp with time zone,
  "confirmation" jsonb,
  "scopes" text[] NOT NULL,
  CONSTRAINT "oauth_refresh_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade,
  CONSTRAINT "oauth_refresh_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null,
  CONSTRAINT "oauth_refresh_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_refresh_token_token_unique" ON "oauth_refresh_token" ("token");
CREATE INDEX IF NOT EXISTS "oauth_refresh_token_client_idx" ON "oauth_refresh_token" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_refresh_token_session_idx" ON "oauth_refresh_token" ("session_id");
CREATE INDEX IF NOT EXISTS "oauth_refresh_token_user_idx" ON "oauth_refresh_token" ("user_id");
CREATE INDEX IF NOT EXISTS "oauth_refresh_token_authorization_code_idx" ON "oauth_refresh_token" ("authorization_code_id");

CREATE TABLE IF NOT EXISTS "oauth_access_token" (
  "id" text PRIMARY KEY NOT NULL,
  "token" text,
  "client_id" text NOT NULL,
  "session_id" text,
  "user_id" text,
  "reference_id" text,
  "authorization_code_id" text,
  "resources" text[],
  "requested_user_info_claims" text[],
  "refresh_id" text,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone,
  "revoked" timestamp with time zone,
  "confirmation" jsonb,
  "scopes" text[] NOT NULL,
  CONSTRAINT "oauth_access_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade,
  CONSTRAINT "oauth_access_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null,
  CONSTRAINT "oauth_access_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade,
  CONSTRAINT "oauth_access_token_refresh_id_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."oauth_refresh_token"("id") ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_access_token_token_unique" ON "oauth_access_token" ("token");
CREATE INDEX IF NOT EXISTS "oauth_access_token_client_idx" ON "oauth_access_token" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_access_token_session_idx" ON "oauth_access_token" ("session_id");
CREATE INDEX IF NOT EXISTS "oauth_access_token_user_idx" ON "oauth_access_token" ("user_id");
CREATE INDEX IF NOT EXISTS "oauth_access_token_authorization_code_idx" ON "oauth_access_token" ("authorization_code_id");
CREATE INDEX IF NOT EXISTS "oauth_access_token_refresh_idx" ON "oauth_access_token" ("refresh_id");

CREATE TABLE IF NOT EXISTS "oauth_consent" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL,
  "user_id" text,
  "reference_id" text,
  "resources" text[],
  "requested_user_info_claims" text[],
  "scopes" text[] NOT NULL,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone,
  CONSTRAINT "oauth_consent_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade,
  CONSTRAINT "oauth_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS "oauth_consent_client_idx" ON "oauth_consent" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_consent_user_idx" ON "oauth_consent" ("user_id");

CREATE TABLE IF NOT EXISTS "oauth_client_assertion" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "mcp_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "client_id" text NOT NULL,
  "client_name" varchar(200),
  "workspace_id" text,
  "project_id" text,
  "organize" varchar(8) DEFAULT 'ask' NOT NULL,
  "tokens_valid_after" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mcp_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade,
  CONSTRAINT "mcp_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null,
  CONSTRAINT "mcp_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null
);
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_connections_user_client_unique" ON "mcp_connections" ("user_id","client_id");

CREATE TABLE IF NOT EXISTS "download_links" (
  "id" text PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL,
  "user_id" text NOT NULL,
  "kind" varchar(30) NOT NULL,
  "payload" jsonb NOT NULL,
  "filename" varchar(255) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "download_count" integer DEFAULT 0 NOT NULL,
  "last_downloaded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "download_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS "download_links_token_hash_unique" ON "download_links" ("token_hash");
CREATE INDEX IF NOT EXISTS "download_links_expires_at_idx" ON "download_links" ("expires_at");
