BEGIN;
-- New CV versions keep the complete source snapshot. Historical versions and
-- exports remain unchanged; legacy read projections derive a baseline only
-- when their citations identify one owned original source unambiguously.
ALTER TABLE candidate_cv_versions ADD COLUMN IF NOT EXISTS baseline jsonb;
ALTER TABLE candidate_cv_versions ADD COLUMN IF NOT EXISTS cv_layout jsonb;
COMMIT;
