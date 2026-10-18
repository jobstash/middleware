-- Candidate reports are not employer authority. Immutable facts are separate from lifecycle state.
CREATE TABLE IF NOT EXISTS candidate_screening_policy_versions (
 id text PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id),previous_version text,
 snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_node_id,id),
 FOREIGN KEY(user_node_id,previous_version) REFERENCES candidate_screening_policy_versions(user_node_id,id)
);
CREATE TABLE IF NOT EXISTS candidate_screening_governance (
 user_node_id bigint PRIMARY KEY REFERENCES graph_nodes(id),revision integer NOT NULL DEFAULT 0,
 active_version text NOT NULL,FOREIGN KEY(user_node_id,active_version) REFERENCES candidate_screening_policy_versions(user_node_id,id)
);
CREATE TABLE IF NOT EXISTS candidate_screening_feedback (
 id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id),assessment_id uuid NOT NULL REFERENCES candidate_screening_jobs(id),
 short_uuid text NOT NULL,organization_id text,dimension text NOT NULL,outcome text NOT NULL CHECK(outcome IN ('reject','interview')),
 evidence text NOT NULL,employer_case_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_node_id,assessment_id,dimension)
);
CREATE TABLE IF NOT EXISTS candidate_screening_feedback_verifications (
 feedback_id uuid PRIMARY KEY REFERENCES candidate_screening_feedback(id),actor_node_id bigint NOT NULL REFERENCES graph_nodes(id),
 authority text NOT NULL CHECK(authority IN ('organization_owner','platform_admin')),organization_id text,
 employer_case_id text NOT NULL,evidence text NOT NULL,evidence_hash text NOT NULL,verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS candidate_screening_policy_proposals (
 id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id),dimension text NOT NULL,feedback_ids uuid[] NOT NULL,
 snapshot jsonb NOT NULL,previous_version text NOT NULL,rationale text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(user_node_id,previous_version) REFERENCES candidate_screening_policy_versions(user_node_id,id)
);
CREATE TABLE IF NOT EXISTS candidate_screening_policy_decisions (
 proposal_id uuid PRIMARY KEY REFERENCES candidate_screening_policy_proposals(id),status text NOT NULL CHECK(status IN ('proposed','trial','validated','rolled_back')),
 approved_at timestamptz,validation jsonb
);
CREATE TABLE IF NOT EXISTS candidate_screening_manager_contexts (
 id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id),short_uuid text NOT NULL,
 organization_id text,actor_node_id bigint NOT NULL REFERENCES graph_nodes(id),authority text NOT NULL CHECK(authority IN ('organization_owner','platform_admin')),
 context_text text NOT NULL,evidence text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS candidate_screening_manager_revocations (
 context_id uuid PRIMARY KEY REFERENCES candidate_screening_manager_contexts(id),actor_node_id bigint NOT NULL REFERENCES graph_nodes(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS candidate_screening_governance_audit (
 id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id),actor_node_id bigint NOT NULL REFERENCES graph_nodes(id),
 operation text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS candidate_screening_authority_receipts (
 actor_node_id bigint NOT NULL REFERENCES graph_nodes(id),request_id uuid NOT NULL,input_hash text NOT NULL,response jsonb NOT NULL,
 PRIMARY KEY(actor_node_id,request_id)
);
CREATE OR REPLACE FUNCTION screening_governance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Screening governance evidence and policy snapshots are immutable'; END $$;
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['candidate_screening_policy_versions','candidate_screening_feedback','candidate_screening_feedback_verifications','candidate_screening_policy_proposals','candidate_screening_manager_contexts','candidate_screening_manager_revocations','candidate_screening_governance_audit','candidate_screening_authority_receipts'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=name::regclass AND tgname='screening_governance_immutable') THEN
   EXECUTE format('CREATE TRIGGER screening_governance_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION screening_governance_immutable()',name);
  END IF;
 END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS screening_feedback_owner ON candidate_screening_feedback(user_node_id,dimension,created_at);
CREATE INDEX IF NOT EXISTS screening_manager_owner ON candidate_screening_manager_contexts(user_node_id,short_uuid,created_at DESC);
