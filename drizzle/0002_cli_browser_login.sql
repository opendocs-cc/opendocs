CREATE TABLE IF NOT EXISTS "cli_login_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "state_hash" text NOT NULL,
  "code_challenge" text NOT NULL,
  "redirect_uri" text NOT NULL,
  "api_url" text NOT NULL,
  "client_name" varchar(100),
  "user_id" text REFERENCES "user"("id") ON DELETE cascade,
  "workspace_id" text REFERENCES "workspaces"("id") ON DELETE set null,
  "auth_code_hash" text,
  "approved_at" timestamp with time zone,
  "consumed_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "cli_login_requests_state_hash_unique"
  ON "cli_login_requests" ("state_hash");

CREATE UNIQUE INDEX IF NOT EXISTS "cli_login_requests_auth_code_hash_unique"
  ON "cli_login_requests" ("auth_code_hash");

CREATE INDEX IF NOT EXISTS "cli_login_requests_expires_at_idx"
  ON "cli_login_requests" ("expires_at");
