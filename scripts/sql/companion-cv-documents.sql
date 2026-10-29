-- Stop legacy CV writers and drain every unconditional PUT before deploying new writers.
-- Apply after companion.sql. Ownership tombstones and exact keys outlive graph accounts.
-- Never expire the corresponding zero-byte R2 fences or reuse a remote identifier.
BEGIN;
CREATE TABLE IF NOT EXISTS candidate_cv_documents (
  document_id uuid PRIMARY KEY,
  user_node_id bigint NOT NULL,
  object_keys text[],
  showcase_url text,
  request_hash text,
  employment_count integer NOT NULL DEFAULT 0,
  state text NOT NULL CHECK (state IN ('pending','attached','deleting','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS candidate_cv_documents_owner ON candidate_cv_documents(user_node_id);
-- Only backend-authored employment provenance proves historical ownership. An editable
-- showcase URL does not. Ambiguous or unreferenced historical objects remain unclaimed.
INSERT INTO candidate_cv_documents(document_id,user_node_id,state)
SELECT (properties->>'documentId')::uuid,min(source_id),'attached'
FROM graph_relationships
WHERE type='CV_EMPLOYMENT' AND properties->>'source'='companion_cv'
  AND properties->>'documentId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
GROUP BY (properties->>'documentId')::uuid
HAVING count(DISTINCT source_id)=1
ON CONFLICT DO NOTHING;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jobstash_app') THEN
    GRANT SELECT,INSERT,UPDATE ON candidate_cv_documents TO jobstash_app;
  END IF;
END $$;
COMMIT;
