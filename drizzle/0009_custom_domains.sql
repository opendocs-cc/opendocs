-- Custom domains (packages/shared/src/custom-domains): a workspace's own
-- domain for its reader pages, plus the one-time codes and viewer sessions
-- of the sign-in bridge that lets readers open private documents there.
--
-- workspace_custom_domains is separate from workspace_domains, which holds
-- email domains for auto-join. One domain per workspace; a hostname may be
-- in several rows while it's being claimed, but only one can be active
-- (partial unique index).
--
-- Run before deploying the code that uses it. Every statement is
-- idempotent; run with psql -f. Constraint and index names match what
-- drizzle-kit generates from schema.ts.

CREATE TABLE IF NOT EXISTS "workspace_custom_domains" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "hostname" varchar(253) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "verification_token" text NOT NULL,
  "consecutive_failures" integer DEFAULT 0 NOT NULL,
  "last_error" varchar(40),
  "last_check" jsonb,
  "verified_at" timestamp with time zone,
  "last_checked_at" timestamp with time zone,
  "failing_since" timestamp with time zone,
  "created_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_custom_domains_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade,
  CONSTRAINT "workspace_custom_domains_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null
);
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_custom_domains_workspace_unique" ON "workspace_custom_domains" ("workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_custom_domains_hostname_idx" ON "workspace_custom_domains" ("hostname");
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_custom_domains_active_hostname_unique" ON "workspace_custom_domains" ("hostname") WHERE "workspace_custom_domains"."status" = 'active';

CREATE TABLE IF NOT EXISTS "custom_domain_bridge_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "code_hash" text NOT NULL,
  "state_hash" text NOT NULL,
  "domain_id" text NOT NULL,
  "hostname" varchar(253) NOT NULL,
  "user_id" text NOT NULL,
  "source_session_id" text NOT NULL,
  "return_path" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "custom_domain_bridge_codes_domain_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."workspace_custom_domains"("id") ON DELETE cascade,
  CONSTRAINT "custom_domain_bridge_codes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade,
  CONSTRAINT "custom_domain_bridge_codes_source_session_id_session_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."session"("id") ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS "custom_domain_bridge_codes_code_hash_unique" ON "custom_domain_bridge_codes" ("code_hash");
CREATE INDEX IF NOT EXISTS "custom_domain_bridge_codes_expires_at_idx" ON "custom_domain_bridge_codes" ("expires_at");
CREATE INDEX IF NOT EXISTS "custom_domain_bridge_codes_domain_idx" ON "custom_domain_bridge_codes" ("domain_id");
CREATE INDEX IF NOT EXISTS "custom_domain_bridge_codes_user_idx" ON "custom_domain_bridge_codes" ("user_id");
CREATE INDEX IF NOT EXISTS "custom_domain_bridge_codes_source_session_idx" ON "custom_domain_bridge_codes" ("source_session_id");

CREATE TABLE IF NOT EXISTS "custom_domain_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL,
  "domain_id" text NOT NULL,
  "hostname" varchar(253) NOT NULL,
  "user_id" text NOT NULL,
  "source_session_id" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "custom_domain_sessions_domain_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."workspace_custom_domains"("id") ON DELETE cascade,
  CONSTRAINT "custom_domain_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade,
  CONSTRAINT "custom_domain_sessions_source_session_id_session_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."session"("id") ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS "custom_domain_sessions_token_hash_unique" ON "custom_domain_sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "custom_domain_sessions_user_idx" ON "custom_domain_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "custom_domain_sessions_expires_at_idx" ON "custom_domain_sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "custom_domain_sessions_domain_idx" ON "custom_domain_sessions" ("domain_id");
CREATE INDEX IF NOT EXISTS "custom_domain_sessions_source_session_idx" ON "custom_domain_sessions" ("source_session_id");
