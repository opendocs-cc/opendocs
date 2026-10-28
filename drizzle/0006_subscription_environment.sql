-- Which Paddle environment each subscription lives in. Servers only count
-- rows from the environment their BILLING_MODE points at, so sandbox tests
-- in the production database grant nothing. Existing rows are live ones.
-- Idempotent; run with psql -f.

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "environment" varchar(16) DEFAULT 'production' NOT NULL;
