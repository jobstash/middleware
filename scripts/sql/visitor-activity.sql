-- Shared visitor reporting schema. No existing user/job metrics are changed.
CREATE TABLE IF NOT EXISTS visitor_activity (
  visitor_id uuid NOT NULL,
  minute timestamptz NOT NULL DEFAULT date_trunc('minute', now()),
  kind text NOT NULL CHECK (kind IN ('request','presence','job_view')),
  path text NOT NULL,
  user_node_id bigint REFERENCES graph_nodes(id) ON DELETE SET NULL,
  account_key text NOT NULL DEFAULT '',
  network_key text,
  ip inet,
  country text,
  browser text,
  requests integer NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(visitor_id,minute,kind,path,account_key)
);
ALTER TABLE visitor_activity ADD COLUMN IF NOT EXISTS ip inet;
CREATE INDEX IF NOT EXISTS visitor_activity_recent ON visitor_activity(last_seen DESC);
CREATE INDEX IF NOT EXISTS visitor_activity_user ON visitor_activity(user_node_id,last_seen DESC) WHERE user_node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS visitor_activity_network ON visitor_activity(network_key,last_seen DESC) WHERE network_key IS NOT NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jobstash_app') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON visitor_activity TO jobstash_app;
  END IF;
END $$;
