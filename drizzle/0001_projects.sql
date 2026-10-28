CREATE TABLE IF NOT EXISTS "projects" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "name" varchar(120) NOT NULL,
  "slug" varchar(64) NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "projects_workspace_slug_unique"
  ON "projects" ("workspace_id", "slug");
CREATE INDEX IF NOT EXISTS "projects_workspace_idx"
  ON "projects" ("workspace_id");
CREATE INDEX IF NOT EXISTS "projects_workspace_default_idx"
  ON "projects" ("workspace_id", "is_default");
CREATE UNIQUE INDEX IF NOT EXISTS "projects_workspace_default_true_unique"
  ON "projects" ("workspace_id")
  WHERE "is_default" = true;

INSERT INTO "projects" ("id", "workspace_id", "name", "slug", "is_default")
SELECT 'default_' || "workspaces"."id", "workspaces"."id", 'Default', 'default', true
FROM "workspaces"
WHERE NOT EXISTS (
  SELECT 1
  FROM "projects"
  WHERE "projects"."workspace_id" = "workspaces"."id"
    AND "projects"."is_default" = true
);

ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "project_id" text;

UPDATE "posts"
SET "project_id" = "projects"."id"
FROM "projects"
WHERE "posts"."workspace_id" = "projects"."workspace_id"
  AND "projects"."is_default" = true
  AND "posts"."project_id" IS NULL;

UPDATE "posts"
SET "slug" = left("slug" || '-' || substr(md5("id"), 1, 8), 160)
WHERE "slug" IN ('tag', 'tags', 'project', 'projects');

ALTER TABLE "posts"
  ALTER COLUMN "project_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_project_id_projects_id_fk'
  ) THEN
    ALTER TABLE "posts"
      ADD CONSTRAINT "posts_project_id_projects_id_fk"
      FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade;
  END IF;
END $$;

DROP INDEX IF EXISTS "posts_workspace_slug_unique";
DROP INDEX IF EXISTS "posts_workspace_published_updated_idx";
DROP INDEX IF EXISTS "posts_workspace_published_added_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "posts_project_slug_unique"
  ON "posts" ("project_id", "slug");
CREATE INDEX IF NOT EXISTS "posts_project_idx"
  ON "posts" ("project_id");
CREATE INDEX IF NOT EXISTS "posts_project_published_updated_idx"
  ON "posts" ("project_id", "is_published", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "posts_project_published_added_idx"
  ON "posts" ("project_id", "is_published", "published_at" DESC);
