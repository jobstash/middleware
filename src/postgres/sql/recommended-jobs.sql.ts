import {
  jobEmployerJoins,
  jobEmployerPayload,
} from "./job-employer-payload.sql";

export const recommendedJobsSql = `
  WITH target_user AS MATERIALIZED (
    SELECT account.id
    FROM graph_nodes account
    WHERE account.label = 'User'
      AND lower(account.properties ->> 'wallet') = lower($1)
    ORDER BY account.id
    LIMIT 1
  ), weighted_activity AS MATERIALIZED (
    SELECT
      event.job_node_id,
      CASE event.event_type
        WHEN 'job_apply' THEN 8.0
        WHEN 'job_bookmark' THEN 5.0
        WHEN 'job_view' THEN CASE
          WHEN event.dwell_ms IS NULL OR event.dwell_ms >= 5000 THEN 2.0
          ELSE 0.5
        END
        WHEN 'job_impression' THEN 0.15
        WHEN 'job_unbookmark' THEN -3.0
        ELSE 0.0
      END * exp(
        -extract(epoch FROM (now() - event.occurred_at)) /
        CASE event.event_type
          WHEN 'job_apply' THEN 15552000.0
          WHEN 'job_bookmark' THEN 10368000.0
          ELSE 3888000.0
        END
      ) AS weight
    FROM user_activity_events event
    JOIN target_user ON target_user.id = event.user_node_id
    WHERE event.job_node_id IS NOT NULL
      AND event.occurred_at >= now() - interval '18 months'
      AND event.event_type IN (
        'job_apply', 'job_bookmark', 'job_unbookmark',
        'job_view', 'job_impression'
      )
  ), classification_affinity AS MATERIALIZED (
    SELECT lower(label.value) AS label_key,
      max(label.value) AS label,
      sum(activity.weight) AS weight
    FROM weighted_activity activity
    JOIN job_search_documents source_job
      ON source_job.job_node_id = activity.job_node_id
    CROSS JOIN LATERAL jsonb_each_text(
      COALESCE(source_job.filter_labels -> 'classifications', '{}'::jsonb)
    ) label
    GROUP BY lower(label.value)
  ), tag_affinity AS MATERIALIZED (
    SELECT lower(label.value) AS label_key,
      max(label.value) AS label,
      sum(activity.weight) AS weight
    FROM weighted_activity activity
    JOIN job_search_documents source_job
      ON source_job.job_node_id = activity.job_node_id
    CROSS JOIN LATERAL jsonb_each_text(
      COALESCE(source_job.filter_labels -> 'tags', '{}'::jsonb)
    ) label
    GROUP BY lower(label.value)
  ), seniority_affinity AS MATERIALIZED (
    SELECT lower(label.value) AS label_key, sum(activity.weight) AS weight
    FROM weighted_activity activity
    JOIN job_search_documents source_job
      ON source_job.job_node_id = activity.job_node_id
    CROSS JOIN LATERAL jsonb_each_text(
      COALESCE(source_job.filter_labels -> 'seniorities', '{}'::jsonb)
    ) label
    GROUP BY lower(label.value)
  ), saved_skills AS MATERIALIZED (
    SELECT DISTINCT lower(COALESCE(
      skill.properties ->> 'name',
      skill.properties ->> 'slug',
      skill.properties ->> 'id'
    )) AS label_key,
    COALESCE(
      skill.properties ->> 'name',
      skill.properties ->> 'slug',
      skill.properties ->> 'id'
    ) AS label
    FROM target_user
    JOIN graph_relationships relationship
      ON relationship.source_id = target_user.id
     AND relationship.type = 'HAS_SKILL'
    JOIN graph_nodes skill
      ON skill.id = relationship.target_id
     AND skill.label = 'Tag'
    WHERE NULLIF(btrim(COALESCE(
      skill.properties ->> 'name',
      skill.properties ->> 'slug',
      skill.properties ->> 'id'
    )), '') IS NOT NULL
  ), search_terms AS MATERIALIZED (
    SELECT lower(NULLIF(btrim(COALESCE(
      event.filters ->> 'titleQuery',
      event.filters ->> 'query',
      CASE WHEN event.query !~ '^\\s*\\{' THEN event.query END
    )), '')) AS term,
    sum(exp(-extract(epoch FROM (now() - event.occurred_at)) / 3888000.0))
      AS weight
    FROM user_activity_events event
    JOIN target_user ON target_user.id = event.user_node_id
    WHERE event.event_type = 'search'
      AND event.occurred_at >= now() - interval '12 months'
    GROUP BY lower(NULLIF(btrim(COALESCE(
      event.filters ->> 'titleQuery',
      event.filters ->> 'query',
      CASE WHEN event.query !~ '^\\s*\\{' THEN event.query END
    )), ''))
    HAVING length(lower(NULLIF(btrim(COALESCE(
      event.filters ->> 'titleQuery',
      event.filters ->> 'query',
      CASE WHEN event.query !~ '^\\s*\\{' THEN event.query END
    )), ''))) >= 3
  ), candidates AS MATERIALIZED (
    SELECT document.*,
      COALESCE(document.organization_id, document.project_id) AS owner_key
    FROM job_search_documents document
    ${jobEmployerJoins("document")}
    CROSS JOIN target_user
    WHERE document.online
      AND NOT document.blocked
      AND document.published_timestamp >=
        (extract(epoch FROM now() - interval '90 days') * 1000)::bigint
      AND num_nonnulls(document.organization_id, document.project_id) = 1
      AND (organization.payload IS NOT NULL OR project.payload IS NOT NULL)
      AND (
        SELECT count(*)
        FROM jsonb_object_keys(COALESCE(
          document.filter_labels -> 'tags', '{}'::jsonb
        ))
      ) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM user_activity_events event
        WHERE event.user_node_id = target_user.id
          AND event.job_node_id = document.job_node_id
          AND event.event_type IN ('job_apply', 'job_dismiss')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM graph_relationships blocked
        JOIN graph_nodes owner ON owner.id = blocked.target_id
        WHERE blocked.source_id = target_user.id
          AND blocked.type = 'BLOCKED_ORG_JOBS'
          AND COALESCE(
            owner.properties ->> 'orgId',
            owner.properties ->> 'id'
          ) = COALESCE(document.organization_id, document.project_id)
      )
  ), candidate_features AS (
    SELECT
      candidate.*,
      class_match.label AS class_label,
      COALESCE(class_match.weight, 0) AS class_score,
      tag_match.labels AS tag_labels,
      COALESCE(tag_match.score, 0) AS tag_score,
      skill_match.labels AS skill_labels,
      COALESCE(skill_match.score, 0) AS skill_score,
      COALESCE(seniority_match.score, 0) AS seniority_score,
      COALESCE(search_match.score, 0) AS search_score,
      search_match.term AS search_term,
      COALESCE(viewed.view_count, 0) AS view_count
    FROM candidates candidate
    LEFT JOIN LATERAL (
      SELECT affinity.label, affinity.weight
      FROM jsonb_each_text(COALESCE(
        candidate.filter_labels -> 'classifications', '{}'::jsonb
      )) label
      JOIN classification_affinity affinity
        ON affinity.label_key = lower(label.value)
      ORDER BY affinity.weight DESC
      LIMIT 1
    ) class_match ON true
    LEFT JOIN LATERAL (
      SELECT
        (array_agg(match.label ORDER BY match.weight DESC))[1:2] AS labels,
        sum(match.weight) * 0.22 /
          greatest(sqrt((
            SELECT count(*)
            FROM jsonb_object_keys(COALESCE(
              candidate.filter_labels -> 'tags', '{}'::jsonb
            ))
          )), 1) AS score
      FROM (
        SELECT affinity.label, greatest(affinity.weight, 0) AS weight
        FROM jsonb_each_text(COALESCE(
          candidate.filter_labels -> 'tags', '{}'::jsonb
        )) label
        JOIN tag_affinity affinity ON affinity.label_key = lower(label.value)
        WHERE affinity.weight > 0
        ORDER BY affinity.weight DESC
        LIMIT 3
      ) match
    ) tag_match ON true
    LEFT JOIN LATERAL (
      SELECT
        (array_agg(skill.label ORDER BY skill.label))[1:2] AS labels,
        count(*)::numeric * 2.5 AS score
      FROM jsonb_each_text(COALESCE(
        candidate.filter_labels -> 'tags', '{}'::jsonb
      )) label
      JOIN saved_skills skill ON skill.label_key = lower(label.value)
    ) skill_match ON true
    LEFT JOIN LATERAL (
      SELECT max(affinity.weight) * 0.8 AS score
      FROM jsonb_each_text(COALESCE(
        candidate.filter_labels -> 'seniorities', '{}'::jsonb
      )) label
      JOIN seniority_affinity affinity
        ON affinity.label_key = lower(label.value)
    ) seniority_match ON true
    LEFT JOIN LATERAL (
      SELECT term.term, term.weight * 4.0 AS score
      FROM search_terms term
      WHERE lower(candidate.title) LIKE '%' || term.term || '%'
      ORDER BY term.weight DESC
      LIMIT 1
    ) search_match ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS view_count
      FROM user_activity_events event
      JOIN target_user ON target_user.id = event.user_node_id
      WHERE event.job_node_id = candidate.job_node_id
        AND event.event_type = 'job_view'
    ) viewed ON true
  ), scored AS (
    SELECT candidate_features.*,
      6.0 * exp(
        -greatest(
          0,
          extract(epoch FROM now()) - published_timestamp / 1000.0
        ) / 864000.0
      )
      + class_score
      + tag_score
      + skill_score
      + seniority_score
      + search_score
      - least(view_count, 5) * 0.4 AS score
    FROM candidate_features
  ), diversified AS (
    SELECT scored.*,
      row_number() OVER (
        PARTITION BY owner_key
        ORDER BY score DESC, published_timestamp DESC, job_node_id
      ) AS owner_rank
    FROM scored
  )
  SELECT
    ${jobEmployerPayload("ranked.payload", "ranked")} AS job,
    ranked.score::double precision AS score,
    array_remove(ARRAY[
      CASE WHEN ranked.search_term IS NOT NULL THEN 'Matches your search' END,
      ranked.class_label,
      ranked.skill_labels[1],
      ranked.tag_labels[1]
    ], NULL) AS "reasonLabels"
  FROM diversified ranked
  ${jobEmployerJoins("ranked")}
  WHERE ranked.owner_rank <= 2
  ORDER BY ranked.score DESC, ranked.published_timestamp DESC, ranked.job_node_id
  LIMIT $2
`;
