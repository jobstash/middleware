-- Apply after device execution and provider schemas.
BEGIN;
CREATE TABLE IF NOT EXISTS candidate_voice_sessions (
  id uuid PRIMARY KEY,
  user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES candidate_agent_sessions(id),
  voice_connection_id uuid NOT NULL REFERENCES candidate_voice_connections(id),
  generation integer NOT NULL,
  request_id uuid NOT NULL,
  idempotency_hash text NOT NULL,
  device_id uuid REFERENCES candidate_devices(id),
  consumed_event_ids jsonb NOT NULL DEFAULT '[]',
  latest_delegation_id text,
  status text NOT NULL CHECK(status IN ('creating','active','closing','closed','failed')),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  transcript jsonb NOT NULL DEFAULT '[]',
  usage jsonb,
  usage_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE(user_node_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS candidate_voice_one_active
  ON candidate_voice_sessions(user_node_id) WHERE status IN ('creating','active','closing');
CREATE TABLE IF NOT EXISTS candidate_voice_delegations (
  voice_session_id uuid NOT NULL REFERENCES candidate_voice_sessions(id) ON DELETE CASCADE,
  delegation_id text NOT NULL,
  agent_request_id uuid REFERENCES candidate_agent_requests(id),
  status text NOT NULL CHECK(status IN ('queued','running','completed','cancelled','failed')),
  prompt text NOT NULL,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(voice_session_id,delegation_id)
);
ALTER TABLE candidate_voice_sessions ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES candidate_devices(id);
ALTER TABLE candidate_voice_sessions ADD COLUMN IF NOT EXISTS consumed_event_ids jsonb NOT NULL DEFAULT '[]';
ALTER TABLE candidate_voice_sessions ADD COLUMN IF NOT EXISTS latest_delegation_id text;
ALTER TABLE candidate_voice_sessions DROP COLUMN IF EXISTS provider_session_id;
ALTER TABLE candidate_voice_sessions DROP COLUMN IF EXISTS answer_sdp;
ALTER TABLE candidate_voice_delegations ADD COLUMN IF NOT EXISTS summary text;
-- Old server-owned sessions cannot resume on a device. Preserve their transcripts/tasks.
UPDATE candidate_voice_sessions SET status='closed',closed_at=COALESCE(closed_at,now()),updated_at=now()
  WHERE device_id IS NULL AND status IN ('creating','active','closing');
UPDATE candidate_voice_delegations d SET status='cancelled',updated_at=now()
  FROM candidate_voice_sessions s WHERE d.voice_session_id=s.id AND s.device_id IS NULL
  AND d.status IN ('queued','running');
CREATE TABLE IF NOT EXISTS candidate_voice_events (
  voice_session_id uuid NOT NULL REFERENCES candidate_voice_sessions(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  input_hash text NOT NULL,
  PRIMARY KEY(voice_session_id,event_id)
);
COMMIT;
