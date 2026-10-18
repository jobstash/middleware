-- User-account-funded screening. No catalogue or CV data is replaced.
CREATE TABLE IF NOT EXISTS candidate_screening_runs (
 id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id),
 document_id uuid NOT NULL REFERENCES candidate_documents(id),connection_id uuid NOT NULL REFERENCES candidate_ai_connections(id),
 cv_text text NOT NULL,cv_hash text NOT NULL,candidate_context text NOT NULL,rubric_hash text NOT NULL,
 status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','paused','completed')),
 pause_reason text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS candidate_screening_one_running ON candidate_screening_runs(user_node_id) WHERE status='running';
CREATE INDEX IF NOT EXISTS candidate_screening_document ON candidate_screening_runs(user_node_id,document_id,created_at DESC);
CREATE TABLE IF NOT EXISTS candidate_screening_jobs (
 id uuid PRIMARY KEY,run_id uuid NOT NULL REFERENCES candidate_screening_runs(id),job_node_id bigint REFERENCES graph_nodes(id) ON DELETE SET NULL,
 short_uuid text NOT NULL,title text NOT NULL,company text NOT NULL,job_payload jsonb NOT NULL,
 job_text text NOT NULL,ad_hash text NOT NULL,additional_context text NOT NULL,ordinal integer NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','unavailable','failed')),
 request_id uuid UNIQUE REFERENCES candidate_agent_requests(id),assessment jsonb,assessment_at timestamptz,
 last_error text,UNIQUE(run_id,short_uuid)
);
CREATE INDEX IF NOT EXISTS candidate_screening_pending ON candidate_screening_jobs(run_id,status,ordinal);
CREATE INDEX IF NOT EXISTS candidate_screening_rank ON candidate_screening_jobs(run_id,((assessment->>'overall_score')::int) DESC,ordinal) WHERE status='completed';
ALTER TABLE candidate_screening_jobs ADD COLUMN IF NOT EXISTS relationship_id bigint REFERENCES graph_relationships(id);

ALTER TABLE candidate_screening_jobs ADD COLUMN IF NOT EXISTS previous_request_id uuid REFERENCES candidate_agent_requests(id);

ALTER TABLE candidate_screening_jobs ADD COLUMN IF NOT EXISTS original_ad_text text;
ALTER TABLE candidate_screening_runs ADD COLUMN IF NOT EXISTS model text;

-- Pin the settings actually used by each request, including across run model changes.
ALTER TABLE candidate_screening_jobs ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE candidate_screening_jobs ADD COLUMN IF NOT EXISTS reasoning_effort text;

-- Conversations stay serial; independent screening requests share the bounded worker pool.
ALTER TABLE candidate_agent_requests ADD COLUMN IF NOT EXISTS request_kind text NOT NULL DEFAULT 'conversation';
DROP INDEX IF EXISTS candidate_agent_one_active;
CREATE UNIQUE INDEX candidate_agent_one_active ON candidate_agent_requests(user_node_id) WHERE request_kind='conversation' AND status IN ('queued','running');
CREATE INDEX IF NOT EXISTS candidate_agent_screening_active ON candidate_agent_requests(user_node_id,status) WHERE request_kind='screening' AND status IN ('queued','running');

ALTER TABLE candidate_screening_jobs ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE candidate_screening_jobs ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

-- Explicit, owner-supplied location context for CV assessments. No inferred default.
ALTER TABLE user_job_preferences ADD COLUMN IF NOT EXISTS screening_location_preferences jsonb;
