-- Apply to canonical PostgreSQL before deploying the Career Agent middleware.
-- Additive only. Never run against a legacy database selected by name alone.
BEGIN;
CREATE TABLE IF NOT EXISTS candidate_career_profiles (
  user_node_id bigint PRIMARY KEY REFERENCES graph_nodes(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  evidence jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS candidate_documents (
  id uuid PRIMARY KEY,
  user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  filename text NOT NULL,
  source_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_node_id, content_hash)
);
ALTER TABLE candidate_documents ADD COLUMN IF NOT EXISTS storage_kind text NOT NULL DEFAULT 'object';
CREATE INDEX IF NOT EXISTS candidate_documents_owner ON candidate_documents(user_node_id, created_at);
CREATE TABLE IF NOT EXISTS candidate_stacks (
  id uuid PRIMARY KEY,
  user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_stacks_owner ON candidate_stacks(user_node_id);
CREATE TABLE IF NOT EXISTS candidate_applications (
  id uuid PRIMARY KEY,
  user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  job_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0,
  state jsonb NOT NULL DEFAULT '{"saved":false,"interested":false,"passed":false,"status":null}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_node_id, job_node_id)
);
CREATE INDEX IF NOT EXISTS candidate_applications_owner ON candidate_applications(user_node_id, updated_at DESC);
-- Keep reconciled duplicate bookmarks from being re-imported on later runs.
CREATE TABLE IF NOT EXISTS candidate_application_import_duplicates (
 application_id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id),
 retained_application_id uuid NOT NULL,record jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now()
);
-- An old outbound Apply click does not establish a submitted application.
INSERT INTO candidate_applications(id,user_node_id,job_node_id,state)
SELECT gen_random_uuid(),edge.source_id,edge.target_id,
  '{"saved":true,"interested":false,"passed":false,"status":null}'::jsonb
FROM graph_relationships edge JOIN graph_nodes account ON account.id=edge.source_id AND account.label='User'
WHERE edge.type='BOOKMARKED'
AND NOT EXISTS (SELECT 1 FROM candidate_application_import_duplicates prior
 WHERE prior.user_node_id=edge.source_id AND prior.record->>'job_node_id'=edge.target_id::text)
ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS candidate_mutations (
  user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  input_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_node_id, request_id)
);
CREATE TABLE IF NOT EXISTS candidate_match_allocations (
  user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  job_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  allocated_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  PRIMARY KEY(user_node_id, job_node_id)
);
CREATE INDEX IF NOT EXISTS candidate_allocation_daily ON candidate_match_allocations(user_node_id, allocated_day);
CREATE TABLE IF NOT EXISTS candidate_subscriptions (
  charge_id text PRIMARY KEY,
  user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  checkout_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','expired')),
  paid_until timestamptz,
  provider_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_subscriptions_owner ON candidate_subscriptions(user_node_id, paid_until);
CREATE TABLE IF NOT EXISTS candidate_payment_events (
  id text PRIMARY KEY,
  charge_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_activity_events DROP CONSTRAINT IF EXISTS user_activity_events_event_type_check;
ALTER TABLE user_activity_events ADD CONSTRAINT user_activity_events_event_type_check CHECK(event_type IN (
  'job_impression','job_view','job_apply','job_bookmark','job_unbookmark','job_dismiss','search',
  'job_interest','job_uninterest','job_application_confirmed','job_preparing','job_outcome','job_undo','company_exclude','company_unexclude'
));
-- Immutable attribution for historical data: no fabricated source excerpt.
INSERT INTO candidate_career_profiles(user_node_id,evidence)
SELECT account.id, COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',gen_random_uuid(),'statement',role->>'description',
  'employer',role->>'company','role',role->>'title',
  'startDate',role->>'startDate','endDate',role->>'endDate',
  'source',jsonb_build_object('kind','existing_profile','excerpt',NULL),
  'confirmation','unconfirmed','conflicts',jsonb_build_array()
)) FROM jsonb_array_elements(COALESCE(account.properties->'recommendationCareer'->'roles','[]')) role
WHERE NULLIF(btrim(role->>'description'),'') IS NOT NULL),'[]')
FROM graph_nodes account WHERE account.label='User'
ON CONFLICT(user_node_id) DO NOTHING;

-- Retain the existing sentence inputs and reuse machinery; append only usable
-- candidate evidence. The view is rebound to the wrapper after the rename.
DO $migration$
DECLARE inputs_view text;
BEGIN
  IF to_regprocedure('career_base_embedding_content(text,bigint)') IS NULL THEN
    IF to_regprocedure('recommendation_embedding_content(text,bigint)') IS NULL THEN
      RAISE EXCEPTION 'Install the recommendation sentence embedding schema first';
    END IF;
    inputs_view := pg_get_viewdef('recommendation_embedding_inputs'::regclass, true);
    ALTER FUNCTION recommendation_embedding_content(text,bigint) RENAME TO career_base_embedding_content;
    EXECUTE $wrapper$
      CREATE FUNCTION recommendation_embedding_content(subject_kind text, subject_id bigint)
      RETURNS text LANGUAGE plpgsql STABLE AS $function$
      DECLARE original text; claims jsonb;
      BEGIN
        original := career_base_embedding_content(subject_kind,subject_id);
        IF subject_kind <> 'user' THEN RETURN original; END IF;
        SELECT jsonb_agg(jsonb_build_object('source','experience','context',claim->>'role','text',claim->>'statement') ORDER BY claim->>'id')
          INTO claims FROM candidate_career_profiles profile CROSS JOIN LATERAL jsonb_array_elements(profile.evidence) claim
          WHERE profile.user_node_id=subject_id AND claim->>'confirmation'='confirmed'
            AND jsonb_array_length(COALESCE(claim->'conflicts','[]'))=0;
        IF claims IS NULL THEN RETURN original; END IF;
        RETURN (COALESCE(original::jsonb,'[]') || claims)::text;
      END;
      $function$
    $wrapper$;
    EXECUTE 'CREATE OR REPLACE VIEW recommendation_embedding_inputs AS ' || inputs_view;
  END IF;
END;
$migration$;
COMMIT;
