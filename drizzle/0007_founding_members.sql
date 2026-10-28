-- Founding-member pricing (packages/shared/src/billing/founder-offer.ts).
--
-- paddle_discount_id mirrors the discount Paddle has on the subscription
-- right now, from the subscription.* webhooks; null for none.
-- founding_member is set the first time a subscription carries the founder
-- discount and never cleared: Paddle drops the discount while a founder is
-- on Team, and switching back to Pro puts it back on.
-- Idempotent; run with psql -f.

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "paddle_discount_id" text;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "founding_member" boolean DEFAULT false NOT NULL;
