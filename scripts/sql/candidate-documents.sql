-- Apply after candidate-capabilities.sql. Source bytes remain in private object storage.
BEGIN;
ALTER TABLE candidate_documents ADD COLUMN IF NOT EXISTS parse_status text;
ALTER TABLE candidate_documents ADD COLUMN IF NOT EXISTS parse_error text;
ALTER TABLE candidate_documents ADD COLUMN IF NOT EXISTS object_content_type text;
ALTER TABLE candidate_documents ADD COLUMN IF NOT EXISTS object_byte_length integer;
ALTER TABLE candidate_documents ADD COLUMN IF NOT EXISTS object_owner text;
ALTER TABLE candidate_parse_attempts ADD COLUMN IF NOT EXISTS parse_snapshot jsonb;
CREATE TABLE IF NOT EXISTS candidate_document_uploads (
  intent_id uuid PRIMARY KEY REFERENCES candidate_setup_intents(id) ON DELETE CASCADE,
  user_node_id bigint NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  document_id uuid REFERENCES candidate_documents(id),
  content_hash text,
  status text NOT NULL CHECK (status IN ('pending','processing','ready','failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_upload_owner ON candidate_document_uploads(user_node_id,created_at DESC);
COMMIT;
