import { RECOMMENDATION_EMBEDDING_VERSION } from "../recommendation-embedding.repository";

/** Requires target_user and profile_skills CTEs. No document-vector averaging. */
export const recommendationSemanticCtes = `
  profile_tag_vectors AS MATERIALIZED (
    SELECT DISTINCT ON (tag.id) 'tag:' || tag.id AS evidence_key,
      least(skill.weight / 6.0, 1.0) AS weight, existing.embedding
    FROM profile_skills skill JOIN graph_nodes tag ON tag.label='Tag'
      AND lower(tag.properties ->> 'name')=skill.label_key
    JOIN LATERAL (
      SELECT embedding FROM tag_embeddings WHERE tag_node_id=tag.id
      ORDER BY (lower(context)=skill.label_key) DESC,length(context),context LIMIT 1
    ) existing ON true
    ORDER BY tag.id,skill.weight DESC
  ), user_evidence AS MATERIALIZED (
    SELECT 'sentence:' || sentence.text_hash AS evidence_key,sentence.weight,sentence.embedding
    FROM target_user JOIN recommendation_embedding_documents doc ON doc.kind='user' AND doc.node_id=target_user.id
      AND doc.version='${RECOMMENDATION_EMBEDDING_VERSION}' AND doc.status='ready'
      AND doc.content_hash=md5(recommendation_embedding_content('user',target_user.id))
    JOIN recommendation_sentence_embeddings sentence USING(kind,node_id)
    WHERE sentence.weight >= 0.35
    UNION ALL SELECT evidence_key,weight,embedding FROM profile_tag_vectors
  ), sentence_neighbors AS MATERIALIZED (
    SELECT evidence.evidence_key,evidence.weight AS evidence_weight,neighbor.*
    FROM user_evidence evidence CROSS JOIN LATERAL (
      SELECT target.kind,target.node_id,target.sentence_hash,target.text_hash,target.source,target.weight,
        1-(target.embedding <=> evidence.embedding) AS similarity
      FROM recommendation_sentence_embeddings target
      WHERE target.kind IN ('job','employer') AND target.weight >= 0.35
      ORDER BY target.embedding <=> evidence.embedding LIMIT 100
    ) neighbor
    WHERE neighbor.similarity >= 0.65
  ), sentence_frequency AS MATERIALIZED (
    SELECT repeated.text_hash,count(DISTINCT (repeated.kind,repeated.node_id)) AS documents
    FROM recommendation_sentence_embeddings repeated
    JOIN (SELECT DISTINCT text_hash FROM sentence_neighbors) matched USING(text_hash)
    WHERE repeated.kind IN ('job','employer') GROUP BY repeated.text_hash
  ), sentence_pairs AS MATERIALIZED (
    SELECT neighbor.*,doc.weight_sum,
      least(1.0,(neighbor.similarity-0.65)/0.30) * neighbor.weight * neighbor.evidence_weight
        / sqrt(greatest(frequency.documents,1)) AS strength,
      row_number() OVER (PARTITION BY neighbor.kind,neighbor.node_id,neighbor.evidence_key
        ORDER BY neighbor.similarity * neighbor.weight DESC,neighbor.sentence_hash) AS evidence_rank
    FROM sentence_neighbors neighbor JOIN recommendation_embedding_documents doc USING(kind,node_id)
    JOIN sentence_frequency frequency USING(text_hash)
    WHERE doc.status='ready' AND doc.version='${RECOMMENDATION_EMBEDDING_VERSION}'
      AND doc.content_hash=md5(recommendation_embedding_content(doc.kind,doc.node_id))
  ), covered_sentences AS (
    SELECT kind,node_id,sentence_hash,max(weight_sum) AS weight_sum,max(strength) AS strength
    FROM sentence_pairs WHERE evidence_rank=1 GROUP BY kind,node_id,sentence_hash
  ), semantic_scores AS MATERIALIZED (
    SELECT kind,node_id,
      (CASE kind WHEN 'job' THEN 18.0 ELSE 8.0 END) * sum(strength) / greatest(max(weight_sum),3.0) AS score,
      count(*) FILTER (WHERE strength >= 0.2) AS supported_sentences
    FROM covered_sentences GROUP BY kind,node_id
  ), related_tags AS MATERIALIZED (
    SELECT nearby.tag_node_id,max(profile.weight * (nearby.similarity-0.8)/0.2) AS strength
    FROM profile_tag_vectors profile CROSS JOIN LATERAL (
      SELECT tag_node_id,1-(embedding <=> profile.embedding) AS similarity
      FROM tag_embeddings ORDER BY embedding <=> profile.embedding LIMIT 12
    ) nearby WHERE nearby.similarity >= 0.8
    GROUP BY nearby.tag_node_id
  )
`;
