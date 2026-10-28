-- Reports on anonymous pages: readers can report /a/<id>, and reports from
-- enough different addresses (FREE_TOOL_LIMITS.reports in
-- packages/shared/src/config/free-tools.ts) hide the page until the owner
-- reviews it. Reports are deleted with the page.
--
-- Every statement is idempotent; run with psql -f. Constraint and index
-- names match what drizzle-kit generates from schema.ts.

ALTER TABLE "anonymous_docs" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "anonymous_doc_reports" (
  "id" text PRIMARY KEY NOT NULL,
  "anonymous_doc_id" text NOT NULL,
  "reporter_hash" text NOT NULL,
  "reason" varchar(32) NOT NULL,
  "details" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "anonymous_doc_reports_anonymous_doc_id_anonymous_docs_id_fk" FOREIGN KEY ("anonymous_doc_id") REFERENCES "public"."anonymous_docs"("id") ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS "anonymous_doc_reports_doc_reporter_unique"
  ON "anonymous_doc_reports" ("anonymous_doc_id","reporter_hash");
