-- Owned CV documents join the existing sentence pipeline; raw ads and vectors remain intact.
ALTER TABLE candidate_documents ADD COLUMN IF NOT EXISTS embedding_node_id bigint REFERENCES graph_nodes(id);
CREATE UNIQUE INDEX IF NOT EXISTS candidate_document_embedding_node ON candidate_documents(embedding_node_id);
CREATE OR REPLACE FUNCTION candidate_document_embedding_node() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.embedding_node_id IS NULL AND nullif(trim(NEW.source_text),'') IS NOT NULL THEN
  INSERT INTO graph_nodes(label,node_key,properties) VALUES ('CandidateDocument','candidate-document:' || NEW.id,'{}') RETURNING id INTO NEW.embedding_node_id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS candidate_document_embedding_node ON candidate_documents;
CREATE TRIGGER candidate_document_embedding_node BEFORE INSERT OR UPDATE OF source_text ON candidate_documents
 FOR EACH ROW EXECUTE FUNCTION candidate_document_embedding_node();
UPDATE candidate_documents SET source_text=source_text WHERE embedding_node_id IS NULL AND nullif(trim(source_text),'') IS NOT NULL;
ALTER TABLE recommendation_embedding_documents DROP CONSTRAINT IF EXISTS recommendation_embedding_documents_kind_check;
ALTER TABLE recommendation_embedding_documents ADD CONSTRAINT recommendation_embedding_documents_kind_check CHECK(kind IN ('user','job','employer','cv'));
CREATE OR REPLACE FUNCTION recommendation_embedding_content(subject_kind text, subject_id bigint)
RETURNS text LANGUAGE plpgsql STABLE AS $function$
DECLARE original text; claims jsonb;
BEGIN
  IF subject_kind = 'cv' THEN
    SELECT jsonb_build_array(jsonb_build_object('source','experience','text',source_text))::text
      INTO original FROM candidate_documents WHERE embedding_node_id=subject_id AND nullif(trim(source_text),'') IS NOT NULL;
    RETURN original;
  END IF;
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


DO $$
DECLARE definition text;
BEGIN
 definition := pg_get_viewdef('recommendation_embedding_inputs'::regclass,true);
 IF strpos(definition, 'candidate_documents') = 0 THEN
  EXECUTE 'CREATE OR REPLACE VIEW recommendation_embedding_inputs AS SELECT * FROM (' || rtrim(definition, E';\n ') || ') base UNION ALL SELECT ''cv''::text, embedding_node_id, recommendation_embedding_content(''cv'',embedding_node_id) FROM candidate_documents WHERE embedding_node_id IS NOT NULL';
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS candidate_cv_job_scores (
 document_id uuid NOT NULL REFERENCES candidate_documents(id) ON DELETE CASCADE,
 job_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
 cv_hash text NOT NULL, job_hash text NOT NULL, score double precision NOT NULL,
 supported_sentences integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(document_id,job_node_id)
);
CREATE INDEX IF NOT EXISTS candidate_cv_job_score_order ON candidate_cv_job_scores(document_id,score DESC);

CREATE TABLE IF NOT EXISTS candidate_cv_job_reviews (
 id uuid PRIMARY KEY, user_node_id bigint NOT NULL REFERENCES graph_nodes(id),
 document_id uuid NOT NULL REFERENCES candidate_documents(id), short_uuid text NOT NULL,
 revision integer NOT NULL, cv_hash text NOT NULL, ad_hash text NOT NULL,
 original_ad_text text NOT NULL, content jsonb NOT NULL,
 agent_request_id uuid NOT NULL REFERENCES candidate_agent_requests(id),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_node_id,document_id,short_uuid)
);
