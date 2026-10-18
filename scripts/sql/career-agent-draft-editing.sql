BEGIN;
-- Keep existing immutable revision/export snapshots. Current drafts use inclusion
-- and explicit candidate authorship, without per-paragraph approval state.
WITH normalized AS (
  SELECT document.id,
    document.content || jsonb_build_object(
      'proposals', COALESCE((
        SELECT jsonb_agg(
          (item.value - 'decision' - 'confirmedAccurate') ||
          jsonb_build_object('excluded', COALESCE(item.value->>'excluded' = 'true', false) OR COALESCE(item.value->>'decision' = 'ignore', false)) ||
          CASE WHEN item.value->>'decision' = 'edit' THEN '{"authorship":"candidate"}'::jsonb ELSE '{}'::jsonb END
          ORDER BY item.ordinal
        ) FROM jsonb_array_elements(COALESCE(document.content->'proposals', '[]'::jsonb)) WITH ORDINALITY item(value, ordinal)
      ), '[]'::jsonb),
      'sections', COALESCE((
        SELECT jsonb_agg(
          (item.value - 'decision' - 'confirmedAccurate') ||
          jsonb_build_object('excluded', COALESCE(item.value->>'excluded' = 'true', false) OR COALESCE(item.value->>'decision' = 'ignore', false)) ||
          CASE WHEN item.value->>'decision' = 'edit' THEN '{"authorship":"candidate"}'::jsonb ELSE '{}'::jsonb END
          ORDER BY item.ordinal
        ) FROM jsonb_array_elements(COALESCE(document.content->'sections', '[]'::jsonb)) WITH ORDINALITY item(value, ordinal)
      ), '[]'::jsonb)
    ) AS content
  FROM candidate_application_documents document
)
UPDATE candidate_application_documents document
SET content = normalized.content, revision = document.revision + 1, updated_at = now()
FROM normalized
WHERE document.id = normalized.id AND document.content IS DISTINCT FROM normalized.content;
COMMIT;
