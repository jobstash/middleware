-- Apply after career-agent-workflows.sql and career-agent-hosted.sql.
-- Additive credential purposes; existing encrypted Codex payloads are unchanged.
BEGIN;
ALTER TABLE candidate_ai_connections
  DROP CONSTRAINT IF EXISTS candidate_ai_connections_provider_check;
ALTER TABLE candidate_ai_connections
  ADD CONSTRAINT candidate_ai_connections_provider_check
  CHECK (provider IN ('codex','grok','openai','anthropic'));

ALTER TABLE candidate_agent_sessions
  ADD COLUMN IF NOT EXISTS context_seed jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS candidate_voice_connections (
  id uuid PRIMARY KEY,
  user_node_id bigint NOT NULL UNIQUE REFERENCES graph_nodes(id) ON DELETE CASCADE,
  credential_ciphertext text,
  generation integer NOT NULL DEFAULT 0 CHECK (generation >= 0),
  status text NOT NULL CHECK (status IN ('pending','connected','disconnected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'connected' OR credential_ciphertext IS NOT NULL)
);
COMMIT;
