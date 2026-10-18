import type { CareerEvidence } from "./career.types";
import { candidateSourceParseReadySql } from "./candidate-source-location";

/** One source-grounding policy for drafting, matching and read projections. */
export function evidenceUsableSql(evidence: string, owner: string): string {
  const source = `${evidence}->'source'`;
  const restricted = `(COALESCE(evidence_document.extraction_provenance->'hidden','[]'::jsonb)<>'[]'::jsonb
    OR evidence_document.extraction_provenance->>'truncated'='true')`;
  const ordinary = `(CASE WHEN ${restricted} THEN
    CASE WHEN ${candidateSourceParseReadySql("evidence_document")}
      THEN evidence_document.parsed_result#>>'{matchingContext,projectionText}' ELSE '' END
    ELSE COALESCE(evidence_document.source_text,'') END)`;
  return `COALESCE((
    COALESCE(${evidence}->'excluded','false'::jsonb) <> 'true'::jsonb
    AND COALESCE(${evidence}->'conflicts','[]'::jsonb)='[]'::jsonb
    AND CASE
      WHEN ${source}->>'kind'='document' THEN EXISTS (
        SELECT 1 FROM candidate_documents evidence_document
        WHERE evidence_document.user_node_id=${owner}
          AND evidence_document.id::text=${source}->>'documentId'
          AND (${source}->>'contentHash' IS NULL OR ${source}->>'contentHash'=evidence_document.content_hash)
          AND (
            (NULLIF(${source}->>'excerpt','') IS NOT NULL
              AND strpos(${ordinary},${source}->>'excerpt')>0
              AND (${source}->>'authority' IS DISTINCT FROM 'citation'
                OR ${evidence}->>'statement'=${source}->>'excerpt'))
            OR (${source}->>'authority'='extraction'
              AND ${source}->>'extractionMode'='image'
              AND ${source}->>'contentHash'=evidence_document.content_hash
              AND (NOT COALESCE(${restricted},false) OR
                (${candidateSourceParseReadySql("evidence_document")}
                  AND ${source}->>'extractionRequestId'=evidence_document.parsed_result#>>'{matchingContext,requestId}'))
              AND EXISTS (SELECT 1 FROM candidate_parse_attempts evidence_attempt
                WHERE evidence_attempt.id::text=${source}->>'extractionRequestId'
                  AND evidence_attempt.user_node_id=${owner}
                  AND evidence_attempt.document_id=evidence_document.id
                  AND evidence_attempt.status='completed'))
          )
      )
      WHEN ${source}->>'kind'='answer' THEN EXISTS (
        SELECT 1 FROM candidate_application_documents evidence_application
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(evidence_application.content->'questions','[]'::jsonb)) evidence_answer
        WHERE evidence_application.user_node_id=${owner}
          AND evidence_application.id::text=${source}->>'applicationDocumentId'
          AND evidence_answer->>'id'=${source}->>'answerId'
          AND evidence_answer->>'revision'=${source}->>'answerRevision'
          AND NULLIF(btrim(evidence_answer->>'answer'),'') IS NOT NULL
          AND ${source}->>'excerpt'=(evidence_answer->>'question') || E'\\n' || (evidence_answer->>'answer')
      )
      ELSE ${source}->'candidateAuthored'='true'::jsonb
        AND ${source}->>'documentId' IS NULL
        AND ${source}->>'kind' IN ('candidate','existing_profile','inference','application')
    END
  ),false)`;
}

/** Selected CVs may use explicit unbound candidate facts, never a second CV. */
export function evidenceInSourceScope(evidence: CareerEvidence, documentId: string): boolean {
  return evidence.source.kind !== "answer" &&
    (evidence.source.documentId === documentId ||
      (!evidence.source.documentId && evidence.source.candidateAuthored === true));
}
