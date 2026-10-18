-- Apply after candidate-documents.sql. Originals and historical source text are unchanged.
ALTER TABLE candidate_documents ADD COLUMN IF NOT EXISTS extraction_provenance jsonb;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='candidate_documents'::regclass AND conname='candidate_document_provenance_bound') THEN
    ALTER TABLE candidate_documents ADD CONSTRAINT candidate_document_provenance_bound CHECK (
      extraction_provenance IS NULL OR COALESCE((
        jsonb_typeof(extraction_provenance) = 'object'
        AND octet_length(extraction_provenance::text) <= 262144
        AND extraction_provenance->>'version' = '1'
        AND extraction_provenance->>'source_hash' = content_hash
        AND extraction_provenance ? 'source_text_hash'
        AND jsonb_typeof(extraction_provenance->'hidden') = 'array'
        AND jsonb_array_length(extraction_provenance->'hidden') <= 256
      ), false)
    );
  END IF;
END $$;
