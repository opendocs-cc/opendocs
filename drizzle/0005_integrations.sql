-- Integrations: workspace connections (Google Drive, DocuSeal), named Drive
-- folders, a ledger of every file stored, and signature requests with
-- their signers. Plus two workspace settings and new audit event types.
--
-- `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that
-- added it, so run this file as plain statements (psql -f), not wrapped in
-- BEGIN/COMMIT. Every statement is idempotent. Constraint and index names
-- match what drizzle-kit generates from schema.ts.

ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'integration_connected';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'integration_disconnected';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'integration_settings_changed';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'document_saved_to_storage';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'signature_requested';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'signature_sent';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'signature_completed';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'signature_cancelled';

ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "integrations_usable_by" varchar(16) DEFAULT 'members' NOT NULL;
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "signature_confirmation" varchar(16) DEFAULT 'chat' NOT NULL;

CREATE TABLE IF NOT EXISTS "workspace_integrations" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "provider" varchar(40) NOT NULL,
  "status" varchar(20) DEFAULT 'connected' NOT NULL,
  "account_label" varchar(255),
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "credentials" text NOT NULL,
  "last_error" text,
  "connected_by_user_id" text,
  "connected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_integrations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade,
  CONSTRAINT "workspace_integrations_connected_by_user_id_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null
);
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_integrations_workspace_provider_unique" ON "workspace_integrations" ("workspace_id","provider");

CREATE TABLE IF NOT EXISTS "integration_destinations" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "integration_id" text NOT NULL,
  "name" varchar(80) NOT NULL,
  "external_id" text NOT NULL,
  "external_name" varchar(255),
  "drive_id" text,
  "drive_name" varchar(255),
  "url" text,
  "created_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integration_destinations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade,
  CONSTRAINT "integration_destinations_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null,
  CONSTRAINT "integration_destinations_integration_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."workspace_integrations"("id") ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS "integration_destinations_workspace_idx" ON "integration_destinations" ("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "integration_destinations_integration_name_unique" ON "integration_destinations" ("integration_id","name");

CREATE TABLE IF NOT EXISTS "signature_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "integration_id" text,
  "provider" varchar(40) NOT NULL,
  "post_id" text,
  "post_version_number" integer NOT NULL,
  "title" varchar(255) NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "signing_order" varchar(20) DEFAULT 'sequential' NOT NULL,
  "message" jsonb,
  "expires_at" timestamp with time zone,
  "document_name" varchar(255) NOT NULL,
  "document_sha256" varchar(64) NOT NULL,
  "document_pdf" bytea,
  "external_id" text,
  "external_url" text,
  "file_to_destination_id" text,
  "filed" jsonb,
  "created_by_user_id" text,
  "created_via" varchar(20),
  "client" varchar(120),
  "confirmed_by_user_id" text,
  "confirmed_via" varchar(20),
  "sent_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "last_synced_at" timestamp with time zone,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "signature_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade,
  CONSTRAINT "signature_requests_integration_id_workspace_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."workspace_integrations"("id") ON DELETE set null,
  CONSTRAINT "signature_requests_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null,
  CONSTRAINT "signature_requests_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null,
  CONSTRAINT "signature_requests_confirmed_by_user_id_user_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null,
  CONSTRAINT "signature_requests_file_to_destination_fk" FOREIGN KEY ("file_to_destination_id") REFERENCES "public"."integration_destinations"("id") ON DELETE set null
);
CREATE INDEX IF NOT EXISTS "signature_requests_workspace_created_idx" ON "signature_requests" ("workspace_id","created_at");
CREATE INDEX IF NOT EXISTS "signature_requests_post_idx" ON "signature_requests" ("post_id");
CREATE INDEX IF NOT EXISTS "signature_requests_external_idx" ON "signature_requests" ("provider","external_id");

CREATE TABLE IF NOT EXISTS "signature_signers" (
  "id" text PRIMARY KEY NOT NULL,
  "request_id" text NOT NULL,
  "position" integer NOT NULL,
  "name" varchar(120) NOT NULL,
  "email" varchar(254) NOT NULL,
  "role" varchar(60) NOT NULL,
  "signing_order" integer NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "external_id" text,
  "completed_at" timestamp with time zone,
  "decline_reason" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "signature_signers_request_id_signature_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."signature_requests"("id") ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS "signature_signers_request_idx" ON "signature_signers" ("request_id");

CREATE TABLE IF NOT EXISTS "integration_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "integration_id" text,
  "provider" varchar(40) NOT NULL,
  "action" varchar(40) NOT NULL,
  "status" varchar(20) NOT NULL,
  "post_id" text,
  "post_version_number" integer,
  "signature_request_id" text,
  "destination_id" text,
  "actor_user_id" text,
  "auth_method" varchar(20),
  "client" varchar(120),
  "request" jsonb,
  "result" jsonb,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integration_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade,
  CONSTRAINT "integration_runs_integration_id_workspace_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."workspace_integrations"("id") ON DELETE set null,
  CONSTRAINT "integration_runs_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null,
  CONSTRAINT "integration_runs_destination_id_integration_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."integration_destinations"("id") ON DELETE set null,
  CONSTRAINT "integration_runs_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null
);
CREATE INDEX IF NOT EXISTS "integration_runs_workspace_created_idx" ON "integration_runs" ("workspace_id","created_at");
CREATE INDEX IF NOT EXISTS "integration_runs_post_idx" ON "integration_runs" ("post_id");
