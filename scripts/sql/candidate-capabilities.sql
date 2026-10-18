-- Apply after mcp-access.sql, career-agent-provider-api.sql and screening schema.
BEGIN;
ALTER TABLE candidate_agent_requests
  ADD COLUMN IF NOT EXISTS oauth_grant_id uuid REFERENCES mcp_grants(id);
CREATE INDEX IF NOT EXISTS candidate_agent_oauth_grant
  ON candidate_agent_requests(oauth_grant_id) WHERE oauth_grant_id IS NOT NULL;
ALTER TABLE IF EXISTS candidate_screening_runs
  ADD COLUMN IF NOT EXISTS oauth_grant_id uuid REFERENCES mcp_grants(id);

ALTER TABLE candidate_subscriptions
  ADD COLUMN IF NOT EXISTS return_target text NOT NULL DEFAULT 'jobstash'
  CHECK (return_target IN ('jobstash','recruiters'));

CREATE TABLE IF NOT EXISTS candidate_setup_intents (
  id uuid PRIMARY KEY,
  user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  grant_id uuid REFERENCES mcp_grants(id),
  client_id uuid REFERENCES mcp_clients(id),
  kind text NOT NULL CHECK (kind IN ('provider','voice','upload')),
  metadata jsonb NOT NULL DEFAULT '{}',
  result_ref jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((grant_id IS NULL) = (client_id IS NULL))
);
CREATE INDEX IF NOT EXISTS candidate_setup_owner
  ON candidate_setup_intents(user_node_id,created_at DESC);
CREATE INDEX IF NOT EXISTS candidate_setup_grant
  ON candidate_setup_intents(grant_id) WHERE grant_id IS NOT NULL;
COMMIT;
