-- Apply after companion.sql and before deploying monthly/yearly candidate billing.
-- Existing checkout agreements were monthly. Preserve every paid period and binding.
BEGIN;
ALTER TABLE candidate_subscriptions ADD COLUMN IF NOT EXISTS billing_interval text
  NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month','year'));
ALTER TABLE candidate_subscriptions ADD COLUMN IF NOT EXISTS discount jsonb;
COMMIT;
