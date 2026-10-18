-- Retire live accuracy approvals; preserve exclusions and existing historical exports.
UPDATE candidate_career_profiles profile SET revision=revision+1,evidence=(
  SELECT COALESCE(jsonb_agg(
    (claim - 'confirmation' - 'usable') || jsonb_build_object(
      'excluded',COALESCE(claim->'excluded'='true'::jsonb,false) OR COALESCE(claim->>'confirmation'='rejected',false),
      'source',(claim->'source') || CASE
        WHEN claim->>'confirmation'='confirmed' AND claim->'source'->>'documentId' IS NULL
          AND claim->'source'->>'kind' IN ('candidate','existing_profile','inference','application')
        THEN '{"candidateAuthored":true}'::jsonb ELSE '{}'::jsonb END
    ) ORDER BY ordinal),'[]'::jsonb)
  FROM jsonb_array_elements(profile.evidence) WITH ORDINALITY item(claim,ordinal)
) WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(profile.evidence) claim WHERE claim ? 'confirmation');

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
    WHERE profile.user_node_id=subject_id AND COALESCE((
    COALESCE(claim->'excluded','false'::jsonb) <> 'true'::jsonb
    AND COALESCE(claim->'conflicts','[]'::jsonb)='[]'::jsonb
    AND CASE
      WHEN claim->'source'->>'kind'='document' THEN EXISTS (
        SELECT 1 FROM candidate_documents evidence_document
        WHERE evidence_document.user_node_id=subject_id
          AND evidence_document.id::text=claim->'source'->>'documentId'
          AND (claim->'source'->>'contentHash' IS NULL OR claim->'source'->>'contentHash'=evidence_document.content_hash)
          AND (
            (NULLIF(claim->'source'->>'excerpt','') IS NOT NULL
              AND strpos(COALESCE(evidence_document.source_text,''),claim->'source'->>'excerpt')>0
              AND (claim->'source'->>'authority' IS DISTINCT FROM 'citation'
                OR claim->>'statement'=claim->'source'->>'excerpt'))
            OR (claim->'source'->>'authority'='extraction'
              AND claim->'source'->>'extractionMode'='image'
              AND claim->'source'->>'contentHash'=evidence_document.content_hash
              AND EXISTS (SELECT 1 FROM candidate_parse_attempts evidence_attempt
                WHERE evidence_attempt.id::text=claim->'source'->>'extractionRequestId'
                  AND evidence_attempt.user_node_id=subject_id
                  AND evidence_attempt.document_id=evidence_document.id
                  AND evidence_attempt.status='completed'))
          )
      )
      WHEN claim->'source'->>'kind'='answer' THEN EXISTS (
        SELECT 1 FROM candidate_application_documents evidence_application
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(evidence_application.content->'questions','[]'::jsonb)) evidence_answer
        WHERE evidence_application.user_node_id=subject_id
          AND evidence_application.id::text=claim->'source'->>'applicationDocumentId'
          AND evidence_answer->>'id'=claim->'source'->>'answerId'
          AND evidence_answer->>'revision'=claim->'source'->>'answerRevision'
          AND NULLIF(btrim(evidence_answer->>'answer'),'') IS NOT NULL
          AND claim->'source'->>'excerpt'=(evidence_answer->>'question') || E'\n' || (evidence_answer->>'answer')
      )
      ELSE claim->'source'->'candidateAuthored'='true'::jsonb
        AND claim->'source'->>'documentId' IS NULL
        AND claim->'source'->>'kind' IN ('candidate','existing_profile','inference','application')
    END
  ),false)
      AND claim->'source'->>'kind'<>'answer';
  IF claims IS NULL THEN RETURN original; END IF;
  RETURN (COALESCE(original::jsonb,'[]') || claims)::text;
END;
$function$;
