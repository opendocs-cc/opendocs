-- Custom domains: the footer's "Published with OpenDocs" line can be hidden
-- per domain (white-label). On for existing and new domains.
ALTER TABLE "workspace_custom_domains" ADD COLUMN IF NOT EXISTS "show_powered_by" boolean DEFAULT true NOT NULL;
