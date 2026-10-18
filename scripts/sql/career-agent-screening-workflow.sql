-- Isolated evidence, function capability and vacancy fit.
ALTER TABLE candidate_screening_runs ADD COLUMN IF NOT EXISTS reasoning_effort text;
ALTER TABLE candidate_screening_runs ADD COLUMN IF NOT EXISTS policy_snapshot jsonb NOT NULL;
ALTER TABLE candidate_screening_runs ADD COLUMN IF NOT EXISTS evaluation_trial boolean NOT NULL DEFAULT false;
ALTER TABLE candidate_screening_runs ADD COLUMN IF NOT EXISTS candidate_cv text NOT NULL;
ALTER TABLE candidate_screening_runs ADD COLUMN IF NOT EXISTS hidden_context text NOT NULL DEFAULT '';
ALTER TABLE candidate_screening_runs ADD COLUMN IF NOT EXISTS provenance_hash text NOT NULL;
ALTER TABLE candidate_screening_runs ADD COLUMN IF NOT EXISTS source_provenance jsonb;
ALTER TABLE candidate_screening_runs ADD COLUMN IF NOT EXISTS source_content_hash text;

ALTER TABLE candidate_screening_jobs ADD COLUMN IF NOT EXISTS current_stage text NOT NULL DEFAULT 'evidence' CHECK(current_stage IN ('evidence','capability','fit'));
ALTER TABLE candidate_screening_jobs ADD COLUMN IF NOT EXISTS evidence jsonb;
ALTER TABLE candidate_screening_jobs ADD COLUMN IF NOT EXISTS capability_cache_key text;
ALTER TABLE candidate_screening_jobs ADD COLUMN IF NOT EXISTS hiring_manager_context text NOT NULL DEFAULT '';

-- Durable identity survives retries and removal of unfinished jobs on an explicit context refresh.
CREATE TABLE IF NOT EXISTS candidate_screening_stage_requests (
 request_id uuid PRIMARY KEY REFERENCES candidate_agent_requests(id),
 job_id uuid REFERENCES candidate_screening_jobs(id) ON DELETE SET NULL,
 stage text NOT NULL CHECK(stage IN ('evidence','capability','fit')),
 artifact jsonb,created_at timestamptz NOT NULL DEFAULT now(),saved_at timestamptz
);
CREATE INDEX IF NOT EXISTS candidate_screening_stage_job ON candidate_screening_stage_requests(job_id,stage);

-- The first successfully completed capability request establishes the immutable canonical result.
CREATE TABLE IF NOT EXISTS candidate_screening_capabilities (
 id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id),
 document_id uuid NOT NULL REFERENCES candidate_documents(id),cv_hash text NOT NULL,provenance_hash text NOT NULL,
 function_key text NOT NULL,rubric_hash text NOT NULL,policy_version text NOT NULL,
 model text NOT NULL,reasoning_effort text,cache_key text NOT NULL UNIQUE,
 assessment jsonb NOT NULL,request_id uuid NOT NULL REFERENCES candidate_agent_requests(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_screening_capability_owner ON candidate_screening_capabilities(user_node_id,document_id,function_key);
ALTER TABLE candidate_screening_jobs ADD COLUMN IF NOT EXISTS capability_id uuid REFERENCES candidate_screening_capabilities(id);
CREATE INDEX IF NOT EXISTS candidate_screening_capability_pending ON candidate_screening_jobs(capability_cache_key) WHERE current_stage='capability';

-- Dev-only real-provider evaluation ledger. No queued job or candidate source is mutated.
CREATE TABLE IF NOT EXISTS candidate_screening_eval_requests (
 request_id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id),
 input_hash text NOT NULL,stage text NOT NULL CHECK(stage IN ('evidence','capability','fit')),
 status text NOT NULL CHECK(status IN ('running','completed','failed')),
 result jsonb,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
