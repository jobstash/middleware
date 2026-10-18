-- Apply after capabilities/documents/screening, before candidate-voice.sql.
-- Retains connections, sessions, documents and historical outputs; retires provider custody.
BEGIN;
CREATE TABLE IF NOT EXISTS candidate_devices (
 id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 public_key text NOT NULL UNIQUE,label text NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','active','revoked')),
 pairing_request_id uuid NOT NULL,challenge text,challenge_expires_at timestamptz,
 last_seen_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS candidate_devices_owner ON candidate_devices(user_node_id);
CREATE TABLE IF NOT EXISTS candidate_device_nonces (
 device_id uuid NOT NULL REFERENCES candidate_devices(id) ON DELETE CASCADE,
 nonce uuid NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(device_id,nonce)
);
CREATE INDEX IF NOT EXISTS candidate_device_nonce_expiry ON candidate_device_nonces(received_at);
ALTER TABLE candidate_ai_connections ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES candidate_devices(id);
ALTER TABLE candidate_ai_connections ADD COLUMN IF NOT EXISTS model_catalog jsonb NOT NULL DEFAULT '[]';
ALTER TABLE candidate_ai_connections ADD COLUMN IF NOT EXISTS execution_lease uuid;
ALTER TABLE candidate_ai_connections ADD COLUMN IF NOT EXISTS execution_lease_until timestamptz;
ALTER TABLE candidate_voice_connections ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES candidate_devices(id);
ALTER TABLE candidate_voice_connections ADD COLUMN IF NOT EXISTS model_catalog jsonb NOT NULL DEFAULT '[]';
ALTER TABLE candidate_voice_connections ADD COLUMN IF NOT EXISTS public_state jsonb NOT NULL DEFAULT '{}';
ALTER TABLE candidate_voice_connections DROP CONSTRAINT IF EXISTS candidate_voice_connections_user_node_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS candidate_voice_one_connected ON candidate_voice_connections(user_node_id) WHERE status='connected';
ALTER TABLE candidate_agent_requests ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES candidate_devices(id);
ALTER TABLE candidate_agent_requests ADD COLUMN IF NOT EXISTS connection_generation integer;
ALTER TABLE candidate_agent_requests ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE candidate_agent_requests ADD COLUMN IF NOT EXISTS device_envelope jsonb;
ALTER TABLE candidate_agent_requests ADD COLUMN IF NOT EXISTS source_pins jsonb;
CREATE TABLE IF NOT EXISTS candidate_device_tasks (
 id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id),
 device_id uuid NOT NULL REFERENCES candidate_devices(id),connection_id uuid NOT NULL REFERENCES candidate_ai_connections(id),
 connection_generation integer NOT NULL,input_hash text NOT NULL,purpose text NOT NULL CHECK(purpose IN ('cv','screening-eval')),
 envelope jsonb NOT NULL,invocation jsonb,source_pins jsonb,
 status text NOT NULL DEFAULT 'waiting_for_device' CHECK(status IN ('waiting_for_device','running','completed','failed','cancelled')),
 lease_id uuid,lease_expires_at timestamptz,event_id uuid,receipt_hash text,response jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS candidate_device_task_queue ON candidate_device_tasks(device_id,status,created_at);
-- Legacy in-flight provider requests have uncertain paid outcomes and are never reissued.
UPDATE candidate_agent_requests r SET status='interrupted',finished_at=now(),worker_id=NULL,heartbeat_at=NULL,lease_expires_at=NULL
 WHERE r.status='running' AND r.device_id IS NULL AND EXISTS(
  SELECT 1 FROM candidate_agent_sessions s JOIN candidate_ai_connections c ON c.id=s.connection_id WHERE s.id=r.session_id AND c.device_id IS NULL);
UPDATE candidate_agent_requests r SET status='paused',finished_at=now(),worker_id=NULL,heartbeat_at=NULL,lease_expires_at=NULL
 WHERE r.status='queued' AND r.device_id IS NULL AND EXISTS(
  SELECT 1 FROM candidate_agent_sessions s JOIN candidate_ai_connections c ON c.id=s.connection_id WHERE s.id=r.session_id AND c.device_id IS NULL);
UPDATE candidate_ai_connections SET status='disconnected',generation=generation+1,execution_lease=NULL,execution_lease_until=NULL
 WHERE device_id IS NULL AND status<>'disconnected';
UPDATE candidate_voice_connections SET status='disconnected',generation=generation+1
 WHERE device_id IS NULL AND status<>'disconnected';
DO $retire_parses$
BEGIN
 IF to_regclass('candidate_screening_runs') IS NOT NULL THEN
  UPDATE candidate_screening_runs r SET status='paused',
   pause_reason='Pair your companion to continue. Previously started work requires review before another paid attempt.',updated_at=now()
   FROM candidate_ai_connections c WHERE r.connection_id=c.id AND c.device_id IS NULL AND r.status='running';
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='candidate_parse_attempts' AND column_name='parse_snapshot') THEN
  WITH retired AS (
   UPDATE candidate_parse_attempts a SET status='interrupted',finished_at=now()
   WHERE a.status='running' AND a.parse_snapshot IS NULL AND NOT EXISTS(SELECT 1 FROM candidate_device_tasks t WHERE t.id=a.id)
   RETURNING document_id,user_node_id
  ) UPDATE candidate_documents d SET parse_status='failed',parse_error='parse_interrupted'
    FROM retired r WHERE d.id=r.document_id AND d.user_node_id=r.user_node_id AND d.parse_status='processing';
 END IF;
END;
$retire_parses$;
ALTER TABLE candidate_ai_connections DROP COLUMN IF EXISTS credential_ciphertext;
ALTER TABLE candidate_ai_connections DROP COLUMN IF EXISTS credential_lease;
UPDATE candidate_ai_connections SET public_state=jsonb_strip_nulls(jsonb_build_object('model',public_state->'model','reasoningEffort',public_state->'reasoningEffort','execution','device')),execution_lease=NULL,execution_lease_until=NULL WHERE device_id IS NULL;
UPDATE candidate_voice_connections SET public_state=jsonb_strip_nulls(jsonb_build_object('model',public_state->'model','reasoningEffort',public_state->'reasoningEffort','execution','device')) WHERE device_id IS NULL;
ALTER TABLE candidate_ai_connections DROP COLUMN IF EXISTS credential_lease_until;
ALTER TABLE candidate_voice_connections DROP COLUMN IF EXISTS credential_ciphertext;
ALTER TABLE candidate_voice_connections DROP COLUMN IF EXISTS credential_lease;
ALTER TABLE candidate_voice_connections DROP COLUMN IF EXISTS credential_lease_until;
COMMIT;
