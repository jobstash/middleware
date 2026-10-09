-- Install after the existing graph/search schema, before the companion release.
-- Only account/device/payment metadata. No profile, CV, scores, drafts or inference tables.
BEGIN;
CREATE TABLE IF NOT EXISTS candidate_devices (
  id uuid PRIMARY KEY,
  user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  public_key text NOT NULL UNIQUE CHECK (length(public_key)=59),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 100),
  status text NOT NULL CHECK (status IN ('pending','active','revoked')),
  pairing_request_id uuid NOT NULL,
  challenge text,
  challenge_expires_at timestamptz NOT NULL,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_devices_owner ON candidate_devices(user_node_id,created_at);
CREATE TABLE IF NOT EXISTS candidate_device_nonces (
  device_id uuid NOT NULL REFERENCES candidate_devices(id) ON DELETE CASCADE,
  nonce uuid NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(device_id,nonce)
);
CREATE INDEX IF NOT EXISTS candidate_device_nonces_received ON candidate_device_nonces(device_id,received_at);
CREATE TABLE IF NOT EXISTS candidate_subscriptions (
  checkout_id text PRIMARY KEY,
  user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  checkout_url text NOT NULL,
  subscription_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired')),
  paid_until timestamptz,
  cancelled_at timestamptz,
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_node_id,request_id),
  CHECK (status<>'active' OR paid_until IS NOT NULL)
);
-- Existing rows are unresolved until checked against Stripe; local expiry alone
-- never proves that a recurring billing agreement is terminal.
ALTER TABLE candidate_subscriptions ADD COLUMN IF NOT EXISTS billing_state text
  NOT NULL DEFAULT 'unresolved' CHECK (billing_state IN ('unresolved','open','agreement','terminal'));
CREATE INDEX IF NOT EXISTS candidate_subscriptions_owner ON candidate_subscriptions(user_node_id,created_at DESC);
CREATE TABLE IF NOT EXISTS candidate_payment_events (
  id text PRIMARY KEY,
  checkout_id text NOT NULL REFERENCES candidate_subscriptions(checkout_id) ON DELETE CASCADE,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jobstash_app') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON candidate_devices,candidate_device_nonces,candidate_subscriptions,candidate_payment_events TO jobstash_app;
  END IF;
END $$;
COMMIT;
