-- Apply after candidate-capabilities.sql, career-evidence-usability.sql and
-- career-agent-draft-editing.sql. Historical documents and exports are unchanged.
BEGIN;
DELETE FROM candidate_setup_intents WHERE kind = 'review';
ALTER TABLE candidate_setup_intents
  DROP COLUMN IF EXISTS resource_kind,
  DROP COLUMN IF EXISTS resource_id,
  DROP COLUMN IF EXISTS resource_revision;
ALTER TABLE candidate_setup_intents DROP CONSTRAINT IF EXISTS candidate_setup_intents_kind_check;
ALTER TABLE candidate_setup_intents ADD CONSTRAINT candidate_setup_intents_kind_check
  CHECK (kind IN ('provider', 'voice', 'upload'));
COMMIT;
