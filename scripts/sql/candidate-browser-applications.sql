-- Candidate-owned browser execution state; no browser process runs on the server.
CREATE TABLE IF NOT EXISTS candidate_browser_applications (
 id uuid PRIMARY KEY, user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 application_id uuid NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES candidate_application_documents(id),
 start_request_id uuid NOT NULL, start_hash text NOT NULL,
 status text NOT NULL CHECK(status IN ('ready','running','awaiting_approval','needs_user','paused','submitted','uncertain','failed','cancelled')),
 state jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_node_id,start_request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS candidate_browser_application_active ON candidate_browser_applications(user_node_id,application_id)
 WHERE status NOT IN ('submitted','failed','cancelled');
CREATE TABLE IF NOT EXISTS candidate_browser_application_events (
 run_id uuid NOT NULL REFERENCES candidate_browser_applications(id) ON DELETE CASCADE,
 event_id uuid NOT NULL, input_hash text NOT NULL, operation text NOT NULL,
 response jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(run_id,event_id)
);
CREATE INDEX IF NOT EXISTS candidate_browser_applications_owner ON candidate_browser_applications(user_node_id,created_at DESC);
