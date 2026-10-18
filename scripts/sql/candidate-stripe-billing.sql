-- Candidate-only Stripe cutover. Apply after career-agent-workflows.sql and candidate-capabilities.sql.
-- No shared billing tables or previously verified legacy membership periods are changed.
BEGIN;
ALTER TABLE candidate_subscriptions ADD COLUMN IF NOT EXISTS billing_provider text NOT NULL DEFAULT 'legacy' CHECK (billing_provider IN ('legacy','stripe'));
ALTER TABLE candidate_subscriptions ADD COLUMN IF NOT EXISTS interval text NOT NULL DEFAULT 'month' CHECK (interval IN ('month','year'));
ALTER TABLE candidate_subscriptions ADD COLUMN IF NOT EXISTS checkout_request_id uuid;
ALTER TABLE candidate_subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE candidate_subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id text;
ALTER TABLE candidate_subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE candidate_subscriptions ADD COLUMN IF NOT EXISTS checkout_expires_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS candidate_stripe_subscription_id ON candidate_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS candidate_stripe_checkout_request ON candidate_subscriptions(user_node_id,checkout_request_id) WHERE checkout_request_id IS NOT NULL;
DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='candidate_subscriptions'::regclass AND conname='candidate_stripe_binding') THEN
    ALTER TABLE candidate_subscriptions ADD CONSTRAINT candidate_stripe_binding CHECK (
      billing_provider<>'stripe' OR (checkout_request_id IS NOT NULL AND stripe_customer_id IS NOT NULL AND stripe_price_id IS NOT NULL AND checkout_expires_at IS NOT NULL)
    );
  END IF;
END $migration$;
COMMIT;
