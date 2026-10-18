import { recommendationSemanticCtes } from "./recommendation-semantic.sql";
import { explicitRecommendationConstraintsSql } from "./recommendation-constraints.sql";
import { stackFacetSql } from "src/career-agent/stack-filters";
import { recommendedJobsSql } from "./recommended-jobs.sql";
// Original ad sentence inputs use the existing background embedding pipeline.
// Stacks reuse sentence frequency weighting and generic-text suppression.
export const originalAdFilterSql = `WHERE document.online
    AND EXISTS (
      SELECT 1 FROM graph_relationships source_edge
      JOIN graph_nodes original ON original.id=source_edge.source_id AND original.label='Jobpost'
      CROSS JOIN LATERAL (SELECT lower(concat_ws(' ',original.properties->>'title',regexp_replace(COALESCE(original.properties->>'content',''),'<[^>]*>',' ','g'))) AS text) ad
      WHERE source_edge.target_id=document.job_node_id AND source_edge.type='HAS_STRUCTURED_JOBPOST'
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE($5::jsonb->'all','[]')) term WHERE strpos(ad.text,lower(term))=0)
        AND (jsonb_array_length(COALESCE($5::jsonb->'any','[]'))=0 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text($5::jsonb->'any') term WHERE strpos(ad.text,lower(term))>0))
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE($5::jsonb->'exclude','[]')) term WHERE strpos(ad.text,lower(term))>0)
    )`;
export const stackJobsSql = recommendedJobsSql
  .replace("ELSE interval '1 month'", "ELSE interval '21 days'")
  .replace("WHERE document.online", `${originalAdFilterSql}\n${stackFacetSql}`);

// CV discovery ranks the entire recent catalogue. Location and profile heuristics
// are not hidden eligibility filters here. Explicit blocks/dismissals stay honored.
export const cvJobsSql = stackJobsSql
  .replace(
    recommendationSemanticCtes,
    `user_evidence AS (SELECT 1 AS present),
 semantic_scores AS MATERIALIZED (
   SELECT 'job'::text AS kind,score.job_node_id AS node_id,score.score,score.supported_sentences
   FROM target_user JOIN candidate_documents source ON source.user_node_id=target_user.id AND source.id=($5::jsonb->>'documentId')::uuid
   JOIN recommendation_embedding_documents cv ON cv.kind='cv' AND cv.node_id=source.embedding_node_id AND cv.status='ready'
   JOIN candidate_cv_job_scores score ON score.document_id=source.id AND score.cv_hash=cv.content_hash
   JOIN recommendation_embedding_documents job ON job.kind='job' AND job.node_id=score.job_node_id AND job.status='ready' AND job.content_hash=score.job_hash
 ), related_tags AS (SELECT NULL::bigint AS tag_node_id,0.0 AS strength WHERE false)`,
  )
  .replace(explicitRecommendationConstraintsSql, "")
  .replace(
    /AND NOT EXISTS \(\s*SELECT 1 FROM excluded_employers employer[\s\S]*?\)\s*AND NOT EXISTS \(\s*SELECT 1 FROM user_job_preferences preferences[\s\S]*?\) IS NOT TRUE\s*\)/,
    "",
  )
  .replace(
    /AND \(\s*SELECT count\(\*\)\s*FROM jsonb_object_keys\(COALESCE\([\s\S]*?\) > 0/,
    "",
  )
  .replace(
    /6\.0 \* exp\([\s\S]*?- least\(view_count, 5\) \* 0\.4 AS score/,
    "semantic_job_score AS score",
  );
