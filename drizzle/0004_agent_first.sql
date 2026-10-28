-- Agent-first features: anonymous 24-hour documents, plus audit event types
-- for version restore, project moves, sharing and claiming.
--
-- `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that
-- added it, so run this file as plain statements (psql -f), not wrapped in
-- BEGIN/COMMIT. Every statement is idempotent.

ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'version_restored';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'moved';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'shared';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'unshared';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'claimed';

CREATE TABLE IF NOT EXISTS "anonymous_docs" (
  "id" text PRIMARY KEY NOT NULL,
  "claim_token_hash" text NOT NULL,
  "title" varchar(255) NOT NULL,
  "summary" text,
  "raw_markdown" text NOT NULL,
  "rendered_html" text NOT NULL,
  "toc" jsonb,
  "client" varchar(64),
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "anonymous_docs_claim_token_hash_unique"
  ON "anonymous_docs" ("claim_token_hash");
CREATE INDEX IF NOT EXISTS "anonymous_docs_expires_at_idx"
  ON "anonymous_docs" ("expires_at");
