-- Additive Career Agent workflows. Apply after career-agent.sql.
BEGIN;
-- Cheap live cache version checks; no warehouse work on feed reads.
CREATE INDEX IF NOT EXISTS career_graph_updated_at_idx ON graph_nodes(updated_at DESC);
CREATE INDEX IF NOT EXISTS career_jobs_updated_at_idx ON job_search_documents(updated_at DESC);
ALTER TABLE candidate_career_profiles ADD COLUMN IF NOT EXISTS directions_updated_at timestamptz;
ALTER TABLE candidate_applications DROP CONSTRAINT IF EXISTS candidate_applications_job_node_id_fkey;
ALTER TABLE candidate_applications ALTER COLUMN job_node_id DROP NOT NULL;
ALTER TABLE candidate_applications ADD CONSTRAINT candidate_applications_job_node_id_fkey FOREIGN KEY(job_node_id) REFERENCES graph_nodes(id) ON DELETE SET NULL;
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS job_snapshot jsonb;
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS short_uuid text;
UPDATE candidate_applications a SET job_snapshot=j.payload,short_uuid=j.short_uuid FROM job_search_documents j WHERE j.job_node_id=a.job_node_id AND a.short_uuid IS NULL;
-- Older catalogue entries may share a public short UUID. Preserve the imported
-- bookmark rows for audit, then merge only untouched bookmark-only duplicates.
CREATE TABLE IF NOT EXISTS candidate_application_import_duplicates (
 application_id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id),
 retained_application_id uuid NOT NULL,record jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now()
);
WITH duplicates AS (
 SELECT a.*,first_value(id) OVER (PARTITION BY user_node_id,short_uuid ORDER BY job_node_id DESC) AS retained_id,
 row_number() OVER (PARTITION BY user_node_id,short_uuid ORDER BY job_node_id DESC) AS position,
 bool_and(revision=0 AND state='{"saved":true,"interested":false,"passed":false,"status":null}'::jsonb) OVER (PARTITION BY user_node_id,short_uuid) AS untouched
 FROM candidate_applications a WHERE short_uuid IS NOT NULL
) INSERT INTO candidate_application_import_duplicates(application_id,user_node_id,retained_application_id,record)
 SELECT id,user_node_id,retained_id,to_jsonb(duplicates)-'retained_id'-'position'-'untouched' FROM duplicates WHERE position>1 AND untouched
 ON CONFLICT DO NOTHING;
DELETE FROM candidate_applications a USING candidate_application_import_duplicates d WHERE a.id=d.application_id AND a.revision=0;
CREATE UNIQUE INDEX IF NOT EXISTS candidate_applications_stable_job ON candidate_applications(user_node_id,short_uuid);
CREATE TABLE IF NOT EXISTS candidate_cv_versions (
 id uuid PRIMARY KEY, user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 cv_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0), name text NOT NULL,
 selections jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_node_id,cv_id,revision)
);
CREATE INDEX IF NOT EXISTS candidate_cvs_owner ON candidate_cv_versions(user_node_id,created_at DESC);
CREATE TABLE IF NOT EXISTS candidate_application_documents (
 id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 application_id uuid NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
 cv_version_id uuid NOT NULL REFERENCES candidate_cv_versions(id),revision integer NOT NULL DEFAULT 1,
 content jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_application_documents_owner ON candidate_application_documents(user_node_id,application_id);
CREATE TABLE IF NOT EXISTS candidate_exports (
 id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES candidate_application_documents(id),document_revision integer NOT NULL,
 kind text NOT NULL,filename text NOT NULL,bytes bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_exports_owner ON candidate_exports(user_node_id,created_at DESC);
ALTER TABLE candidate_career_profiles ADD COLUMN IF NOT EXISTS directions text[] NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS candidate_ai_connections (
 id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 provider text NOT NULL CONSTRAINT candidate_ai_connections_provider_check CHECK(provider IN ('codex','grok','openai','anthropic')), status text NOT NULL DEFAULT 'pending',
 credential_ciphertext text, generation integer NOT NULL DEFAULT 0, public_state jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_connections_owner ON candidate_ai_connections(user_node_id);
CREATE TABLE IF NOT EXISTS candidate_agent_sessions (
 id uuid PRIMARY KEY,user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL REFERENCES candidate_ai_connections(id),revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS candidate_agent_requests (
 id uuid PRIMARY KEY,session_id uuid NOT NULL REFERENCES candidate_agent_sessions(id) ON DELETE CASCADE,
 user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE, prompt text NOT NULL,
 status text NOT NULL DEFAULT 'queued',worker_id uuid,started_at timestamptz,heartbeat_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS candidate_agent_one_active ON candidate_agent_requests(user_node_id) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS candidate_agent_queue ON candidate_agent_requests(status,created_at);
CREATE TABLE IF NOT EXISTS candidate_agent_events (
 id bigserial PRIMARY KEY,request_id uuid NOT NULL REFERENCES candidate_agent_requests(id) ON DELETE CASCADE,
 event jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS candidate_network_cache (
 user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,organization_id text NOT NULL,
 root text NOT NULL,paths jsonb NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(user_node_id,organization_id)
);
-- Retained legacy metadata is canonical, provenance-bearing and suppression-aware.
CREATE TABLE IF NOT EXISTS candidate_network_metadata (
 login text PRIMARY KEY, sources jsonb NOT NULL DEFAULT '[]',contacts jsonb NOT NULL DEFAULT '[]',
 annotations jsonb NOT NULL DEFAULT '[]',suppressed boolean NOT NULL DEFAULT false, reconciled_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE candidate_subscriptions ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;
ALTER TABLE candidate_subscriptions ADD COLUMN IF NOT EXISTS provider_state jsonb;
ALTER TABLE candidate_subscriptions ADD COLUMN IF NOT EXISTS reconcile_attempt_at timestamptz;
ALTER TABLE candidate_subscriptions ADD COLUMN IF NOT EXISTS reconcile_error text;
CREATE TABLE IF NOT EXISTS candidate_telemetry (
 user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,request_id uuid NOT NULL,
 event text NOT NULL,surface text NOT NULL,ranking_version text NOT NULL,job_id text,
 occurred_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_node_id,request_id)
);
CREATE INDEX IF NOT EXISTS candidate_telemetry_report ON candidate_telemetry(occurred_at,event,surface,ranking_version);
CREATE OR REPLACE FUNCTION candidate_capture_job_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.job_node_id IS NOT NULL THEN
  SELECT COALESCE(NEW.job_snapshot,j.payload),COALESCE(NEW.short_uuid,j.short_uuid) INTO NEW.job_snapshot,NEW.short_uuid FROM job_search_documents j WHERE j.job_node_id=NEW.job_node_id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS candidate_capture_job ON candidate_applications;
CREATE TRIGGER candidate_capture_job BEFORE INSERT OR UPDATE OF job_node_id ON candidate_applications FOR EACH ROW EXECUTE FUNCTION candidate_capture_job_snapshot();
COMMIT;
ALTER TABLE candidate_documents ADD COLUMN IF NOT EXISTS parsed_result jsonb;
CREATE TABLE IF NOT EXISTS candidate_parse_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES candidate_documents(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'running',usage jsonb,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS candidate_one_parse_per_user ON candidate_parse_attempts(user_node_id) WHERE status='running';
CREATE INDEX IF NOT EXISTS candidate_parse_daily ON candidate_parse_attempts(user_node_id,created_at);
ALTER TABLE candidate_cv_versions ADD COLUMN IF NOT EXISTS heading jsonb NOT NULL DEFAULT '{}';
ALTER TABLE candidate_cv_versions ADD COLUMN IF NOT EXISTS direction text;
ALTER TABLE candidate_exports ADD COLUMN IF NOT EXISTS provenance jsonb;
CREATE TABLE IF NOT EXISTS candidate_application_document_versions (
 document_id uuid NOT NULL REFERENCES candidate_application_documents(id) ON DELETE CASCADE,
 revision integer NOT NULL,user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 content jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,revision)
);
CREATE OR REPLACE FUNCTION candidate_capture_application_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO candidate_application_document_versions(document_id,revision,user_node_id,content) VALUES(NEW.id,NEW.revision,NEW.user_node_id,NEW.content) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS candidate_application_revision ON candidate_application_documents;
CREATE TRIGGER candidate_application_revision AFTER INSERT OR UPDATE OF content,revision ON candidate_application_documents FOR EACH ROW EXECUTE FUNCTION candidate_capture_application_revision();
INSERT INTO candidate_application_document_versions(document_id,revision,user_node_id,content) SELECT id,revision,user_node_id,content FROM candidate_application_documents ON CONFLICT DO NOTHING;

ALTER TABLE candidate_agent_events ADD COLUMN IF NOT EXISTS mutation_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS candidate_agent_mutation_event ON candidate_agent_events(request_id,mutation_id) WHERE mutation_id IS NOT NULL;

ALTER TABLE candidate_cv_versions ADD COLUMN IF NOT EXISTS guidance jsonb;

ALTER TABLE candidate_agent_sessions ADD COLUMN IF NOT EXISTS object_kind text;
ALTER TABLE candidate_agent_sessions ADD COLUMN IF NOT EXISTS object_id uuid;
ALTER TABLE candidate_agent_sessions ADD COLUMN IF NOT EXISTS object_classification text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS candidate_agent_category_session ON candidate_agent_sessions(user_node_id,connection_id,object_kind,object_id,object_classification) WHERE object_id IS NOT NULL;
DROP INDEX IF EXISTS candidate_agent_object_session;

ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS original_ad_text text;

-- Same sentence queue, hashes and vectors; change job inputs to original ad blocks.
CREATE OR REPLACE FUNCTION recommendation_embedding_content(subject_kind text, subject_id bigint)
RETURNS text LANGUAGE plpgsql STABLE AS $function$
DECLARE original text; claims jsonb;
BEGIN
  IF subject_kind = 'job' THEN
    SELECT jsonb_build_array(jsonb_build_object('source','description','text',n.properties->>'content'))::text
      INTO original FROM graph_relationships e JOIN graph_nodes n ON n.id=e.source_id AND n.label='Jobpost'
      WHERE e.target_id=subject_id AND e.type='HAS_STRUCTURED_JOBPOST' ORDER BY n.id LIMIT 1;
    RETURN original;
  END IF;
  original := career_base_embedding_content(subject_kind,subject_id);
  IF subject_kind <> 'user' THEN RETURN original; END IF;
  SELECT jsonb_agg(jsonb_build_object('source','experience','context',claim->>'role','text',claim->>'statement') ORDER BY claim->>'id')
    INTO claims FROM candidate_career_profiles profile CROSS JOIN LATERAL jsonb_array_elements(profile.evidence) claim
    WHERE profile.user_node_id=subject_id AND claim->>'confirmation'='confirmed'
      AND jsonb_array_length(COALESCE(claim->'conflicts','[]'))=0;
  IF claims IS NULL THEN RETURN original; END IF;
  RETURN (COALESCE(original::jsonb,'[]') || claims)::text;
END;
$function$;

ALTER TABLE candidate_network_cache ADD COLUMN IF NOT EXISTS truncated boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION candidate_capture_job_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.job_node_id IS NOT NULL THEN
  SELECT COALESCE(NEW.job_snapshot,j.payload),COALESCE(NEW.short_uuid,j.short_uuid) INTO NEW.job_snapshot,NEW.short_uuid FROM job_search_documents j WHERE j.job_node_id=NEW.job_node_id;
  SELECT COALESCE(NEW.original_ad_text,n.properties->>'content') INTO NEW.original_ad_text
    FROM graph_relationships e JOIN graph_nodes n ON n.id=e.source_id AND n.label='Jobpost'
    WHERE e.target_id=NEW.job_node_id AND e.type='HAS_STRUCTURED_JOBPOST' ORDER BY n.id LIMIT 1;
 END IF;
 RETURN NEW;
END $$;

-- Short-lived network work leases enforce limits across middleware processes.
CREATE TABLE IF NOT EXISTS candidate_network_leases (
  id uuid PRIMARY KEY,
  user_node_id bigint NOT NULL REFERENCES graph_nodes(id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS candidate_network_leases_expiry ON candidate_network_leases(expires_at);

-- Reconcile and retain these rows before retiring any legacy database.
-- This archive has no public controller and is never returned by people APIs.
CREATE TABLE IF NOT EXISTS candidate_network_legacy_records (
 source_database text NOT NULL,
 source_table text NOT NULL,
 source_id text NOT NULL,
 record jsonb NOT NULL,
 content_hash text NOT NULL,
 reconciled_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source_database,source_table,source_id)
);

-- Trusted legacy identifiers, never name-similarity or fabricated graph links.
CREATE OR REPLACE VIEW candidate_network_staff_associations AS
WITH staff AS (
 SELECT s.source_database,s.source_id,s.record,
   o.record->>'legacy_jobstash_org_id' AS legacy_org_id,
   i.record->>'legacy_jobstash_investor_id' AS legacy_investor_id
 FROM candidate_network_legacy_records s
 LEFT JOIN candidate_network_legacy_records i ON i.source_database=s.source_database AND i.source_table='investors' AND i.source_id=s.record->>'investor_id'
 LEFT JOIN candidate_network_legacy_records o ON o.source_database=s.source_database AND o.source_table='orgs' AND o.source_id=COALESCE(s.record->>'org_id',i.record->>'org_id')
 WHERE s.source_table='staff'
), canonical AS (
 SELECT staff.*, investor.properties->>'id' AS fund_id,
   COALESCE(org.organization_id,fund_org.organization_id) AS organization_id
 FROM staff
 LEFT JOIN graph_nodes investor ON investor.label='Investor' AND
   (investor.properties->>'id'=staff.legacy_investor_id OR investor.properties->'legacyInvestorIds' ? staff.legacy_investor_id)
 LEFT JOIN organization_search_documents org ON org.organization_id=staff.legacy_org_id
 LEFT JOIN organization_search_documents fund_org ON fund_org.organization_id=investor.properties->>'orgId'
)
SELECT DISTINCT source_database,source_id,record,organization_id,fund_id FROM canonical
WHERE organization_id IS NOT NULL OR fund_id IS NOT NULL;

CREATE OR REPLACE FUNCTION candidate_network_person_suppressed(staff_id text, github_login text)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM candidate_network_metadata m WHERE m.login=lower(github_login) AND m.suppressed)
 OR EXISTS(SELECT 1 FROM candidate_network_legacy_records s WHERE s.source_table='person_suppressions'
 AND (s.record->>'staff_id'=staff_id OR lower(s.record->>'github_login')=lower(github_login))
 AND COALESCE(s.record->>'status','pending') NOT IN ('rejected','denied','withdrawn'))
$$;
CREATE OR REPLACE FUNCTION candidate_network_org_suppressed(org_id text)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(
 SELECT 1 FROM organization_search_documents o
 JOIN candidate_network_legacy_records denied ON denied.source_table='org_denylist'
 WHERE o.organization_id=org_id AND (
   EXISTS(SELECT 1 FROM candidate_network_legacy_records legacy WHERE legacy.source_table='orgs'
     AND legacy.source_database=denied.source_database AND legacy.source_id=denied.record->>'org_id'
     AND legacy.record->>'legacy_jobstash_org_id'=org_id)
   OR (denied.record->>'org_id' IS NULL AND NULLIF(btrim(denied.record->>'pattern'),'') IS NOT NULL AND
     (strpos(lower(o.payload->>'name'),lower(btrim(denied.record->>'pattern')))>0 OR
      strpos(lower(COALESCE(o.payload->>'website',o.payload->>'url','')),lower(btrim(denied.record->>'pattern')))>0))
 ))
$$;
CREATE INDEX IF NOT EXISTS candidate_network_investor_id ON graph_nodes((properties->>'id')) WHERE label='Investor';
CREATE INDEX IF NOT EXISTS candidate_network_investor_legacy_ids ON graph_nodes USING gin((properties->'legacyInvestorIds')) WHERE label='Investor';
CREATE INDEX IF NOT EXISTS candidate_network_legacy_staff_investor ON candidate_network_legacy_records((record->>'investor_id')) WHERE source_table='staff';
CREATE INDEX IF NOT EXISTS candidate_network_legacy_staff_org ON candidate_network_legacy_records((record->>'org_id')) WHERE source_table='staff';
CREATE OR REPLACE FUNCTION candidate_network_github_org_suppressed(github_login text)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM graph_nodes github JOIN graph_relationships edge ON edge.target_id=github.id AND edge.type='HAS_GITHUB'
 JOIN organization_search_documents org ON org.organization_node_id=edge.source_id
 WHERE lower(github.properties->>'login')=lower(github_login) AND candidate_network_org_suppressed(org.organization_id))
$$;

CREATE TABLE IF NOT EXISTS candidate_career_archetypes (
 id text PRIMARY KEY,name text NOT NULL,classification text NOT NULL UNIQUE,
 requirements jsonb NOT NULL DEFAULT '[]',sample_size integer NOT NULL DEFAULT 0,
 sampled_at timestamptz,source text NOT NULL DEFAULT 'Original advertisement sentence observations'
);
INSERT INTO candidate_career_archetypes(id,name,classification) VALUES
 ('BACKEND','Backend','BACKEND'),('ENGINEERING_MANAGEMENT','Engineering Management','ENGINEERING_MANAGEMENT'),
 ('SMART_CONTRACTS','Smart Contracts','SMART_CONTRACTS') ON CONFLICT(id) DO NOTHING;
CREATE OR REPLACE FUNCTION refresh_candidate_archetype_requirements() RETURNS void LANGUAGE sql AS $$
 WITH samples AS MATERIALIZED (
   SELECT a.id,j.job_node_id,j.short_uuid FROM candidate_career_archetypes a CROSS JOIN LATERAL (
     SELECT j.job_node_id,j.short_uuid FROM job_search_documents j WHERE j.online AND NOT j.blocked
       AND j.published_timestamp BETWEEN extract(epoch FROM now()-interval '21 days')*1000 AND extract(epoch FROM now())*1000
       AND EXISTS(SELECT 1 FROM jsonb_each_text(j.filter_labels->'classifications') c WHERE c.value=a.classification)
     ORDER BY j.published_timestamp DESC,j.job_node_id LIMIT 100) j
 ), observations AS MATERIALIZED (
   SELECT samples.id,sentence.text_hash,min(sentence.sentence) AS excerpt,count(DISTINCT samples.job_node_id)::int AS vacancies,
     array_agg(DISTINCT samples.short_uuid) AS source_job_ids,max(sentence.weight) AS weight
   FROM samples JOIN recommendation_embedding_documents doc ON doc.kind='job' AND doc.node_id=samples.job_node_id
     AND doc.status='ready' AND doc.content_hash=md5(recommendation_embedding_content('job',doc.node_id))
   JOIN recommendation_sentence_embeddings sentence USING(kind,node_id)
   WHERE sentence.weight>=0.5 AND sentence.sentence ~* '(experience|build|develop|responsib|skill|proficien|manage|engineer|smart contract|solidity|rust|typescript)'
   GROUP BY samples.id,sentence.text_hash
 ), ranked AS (
   SELECT *,row_number() OVER(PARTITION BY id ORDER BY vacancies*weight DESC,text_hash) AS rank FROM observations
 ) UPDATE candidate_career_archetypes a SET requirements=COALESCE((SELECT jsonb_agg(jsonb_build_object(
     'textHash',r.text_hash,'excerpt',left(r.excerpt,1200),'vacancies',r.vacancies,'sourceJobIds',r.source_job_ids,
     'matchMethod','observed-requirement','reviewRequired',true) ORDER BY r.rank) FROM ranked r WHERE r.id=a.id AND r.rank<=20),'[]'),
   sample_size=(SELECT count(*) FROM samples s WHERE s.id=a.id),sampled_at=now();
$$;

ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS ranking_version text NOT NULL DEFAULT 'unknown';
