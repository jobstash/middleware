-- Apply after candidate-capabilities.sql and the full career workflow schema.
BEGIN;
CREATE TABLE IF NOT EXISTS candidate_introduction_drafts (
  id uuid PRIMARY KEY,
  user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  organization_id text NOT NULL,
  application_id uuid REFERENCES candidate_applications(id),
  suggestion_id text NOT NULL,
  evidence_snapshot jsonb NOT NULL,
  text text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_introduction_owner
  ON candidate_introduction_drafts(user_node_id,updated_at DESC);
COMMIT;
