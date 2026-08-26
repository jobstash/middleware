import {
  jobEmployerJoins,
  jobEmployerPayload,
} from "./job-employer-payload.sql";

export const recommendedJobsSql = `
  WITH target_user AS MATERIALIZED (
    SELECT account.id, account.properties
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
  ), profile_context AS MATERIALIZED (
    SELECT
      COALESCE(
        jsonb_boolean_value(target_user.properties, 'cryptoNative'), false
      ) AS crypto_native,
      COALESCE(
        jsonb_boolean_value(target_user.properties, 'cryptoAdjacent'), false
      ) AS crypto_adjacent
    FROM target_user
  ), preference_context AS MATERIALIZED (
    SELECT
      COALESCE(preferences.role_priorities, ARRAY[]::text[])
        AS role_priorities,
      COALESCE(preferences.target_organizations, ARRAY[]::text[])
        AS target_organizations,
      COALESCE(preferences.job_categories, ARRAY[]::text[])
        AS job_categories,
      COALESCE(preferences.seniority_levels, ARRAY[]::text[])
        AS seniority_levels,
      preferences.company_size_min,
      preferences.company_size_max,
      COALESCE(preferences.industries, ARRAY[]::text[]) AS industries,
      COALESCE(preferences.funding_stages, ARRAY[]::text[])
        AS funding_stages,
      COALESCE(preferences.payment_currencies, ARRAY[]::text[])
        AS payment_currencies,
      COALESCE(preferences.commitments, ARRAY[]::text[]) AS commitments,
      preferences.minimum_salary,
      preferences.salary_currency
    FROM target_user
    LEFT JOIN user_job_preferences preferences
      ON preferences.user_node_id = target_user.id
  ), profile_skills AS MATERIALIZED (
    SELECT signal.label_key, max(signal.label) AS label,
      max(signal.weight) AS weight
    FROM (
      SELECT lower(COALESCE(
        skill.properties ->> 'name',
        skill.properties ->> 'slug',
        skill.properties ->> 'id'
      )) AS label_key,
      COALESCE(
        skill.properties ->> 'name',
        skill.properties ->> 'slug',
        skill.properties ->> 'id'
      ) AS label,
      4.0::numeric AS weight
      FROM target_user
      JOIN graph_relationships relationship
        ON relationship.source_id = target_user.id
       AND relationship.type = 'HAS_SKILL'
      JOIN graph_nodes skill
        ON skill.id = relationship.target_id
       AND skill.label = 'Tag'
      UNION ALL
      SELECT lower(preferred_skill.value) AS label_key,
        preferred_skill.value AS label,
        6.0::numeric AS weight
      FROM target_user
      JOIN user_job_preferences preferences
        ON preferences.user_node_id = target_user.id
      CROSS JOIN LATERAL unnest(
        COALESCE(preferences.preferred_skills, ARRAY[]::text[])
      ) preferred_skill(value)
      UNION ALL
      SELECT lower(repository_skill.value) AS label_key,
        repository_skill.value AS label,
        (
          1.0 + least(
            2.0,
            ln(1.0 + greatest(COALESCE(
              jsonb_numeric_value(repository.properties, 'commitsCount'), 0
            ), 0)) / 3.0
          )
        ) * CASE
          WHEN COALESCE(
            jsonb_numeric_value(repository.properties, 'lastContributedAt'), 0
          ) >= extract(epoch FROM now() - interval '2 years') * 1000
            THEN 1.0
          ELSE 0.75
        END AS weight
      FROM target_user
      JOIN graph_relationships account_history
        ON account_history.source_id = target_user.id
       AND account_history.type = 'HAS_WORK_HISTORY'
      JOIN graph_nodes history
        ON history.id = account_history.target_id
       AND history.label = 'UserWorkHistory'
      JOIN graph_relationships history_repository
        ON history_repository.source_id = history.id
       AND history_repository.type = 'WORKED_ON_REPO'
      JOIN graph_nodes repository
        ON repository.id = history_repository.target_id
       AND repository.label = 'UserWorkHistoryRepo'
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(repository.properties -> 'skills') = 'array'
            THEN repository.properties -> 'skills'
          ELSE '[]'::jsonb
        END
      ) repository_skill
    ) signal
    WHERE NULLIF(btrim(signal.label), '') IS NOT NULL
    GROUP BY signal.label_key
  ), owner_affinity AS MATERIALIZED (
    SELECT COALESCE(
      source_job.organization_id, source_job.project_id
    ) AS owner_key,
    sum(activity.weight) AS weight
    FROM weighted_activity activity
    JOIN job_search_documents source_job
      ON source_job.job_node_id = activity.job_node_id
    WHERE COALESCE(
      source_job.organization_id, source_job.project_id
    ) IS NOT NULL
    GROUP BY COALESCE(
      source_job.organization_id, source_job.project_id
    )
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
      COALESCE(document.organization_id, document.project_id) AS owner_key,
      COALESCE(organization.name, project.name) AS owner_name,
      CASE
        WHEN document.organization_id IS NOT NULL THEN
          COALESCE(organization.tags, ARRAY[]::text[])
          || COALESCE(organization.categories, ARRAY[]::text[])
        ELSE
          COALESCE(project.tags, ARRAY[]::text[])
          || COALESCE(project.categories, ARRAY[]::text[])
      END AS owner_terms
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
      COALESCE(preference_match.score, 0) AS preference_score,
      preference_match.labels AS preference_labels,
      preference_context.minimum_salary AS preferred_minimum_salary,
      preference_context.salary_currency AS preferred_salary_currency,
      preference_context.company_size_min AS preferred_company_size_min,
      preference_context.company_size_max AS preferred_company_size_max,
      COALESCE(owner_affinity.weight, 0) * 0.35 AS owner_score,
      CASE
        WHEN NOT profile_context.crypto_native
          AND NOT profile_context.crypto_adjacent
          AND candidate.onboard_into_web3
          THEN 4.0
        ELSE 0.0
      END AS web3_score,
      COALESCE(viewed.view_count, 0) AS view_count
    FROM candidates candidate
    CROSS JOIN profile_context
    CROSS JOIN preference_context
    LEFT JOIN owner_affinity
      ON owner_affinity.owner_key = candidate.owner_key
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
        sum(skill.weight) AS score
      FROM jsonb_each_text(COALESCE(
        candidate.filter_labels -> 'tags', '{}'::jsonb
      )) label
      JOIN profile_skills skill ON skill.label_key = lower(label.value)
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
      SELECT least(sum(signal.score), 30.0) AS score,
        (array_agg(signal.label ORDER BY signal.score DESC))[1:3] AS labels
      FROM (
        SELECT 9.0::numeric AS score, category.value AS label
        FROM jsonb_each_text(COALESCE(
          candidate.filter_labels -> 'classifications', '{}'::jsonb
        )) category
        WHERE EXISTS (
          SELECT 1
          FROM unnest(preference_context.job_categories) preferred(value)
          WHERE translate(lower(preferred.value), ' _-', '') =
            translate(lower(category.value), ' _-', '')
        )
        UNION ALL
        SELECT 7.0::numeric AS score, seniority.value AS label
        FROM jsonb_each_text(COALESCE(
          candidate.filter_labels -> 'seniorities', '{}'::jsonb
        )) seniority
        WHERE EXISTS (
          SELECT 1
          FROM unnest(preference_context.seniority_levels) preferred(value)
          WHERE translate(lower(preferred.value), ' _-', '') =
            translate(lower(seniority.value), ' _-', '')
        )
        UNION ALL
        SELECT 10.0::numeric AS score, 'Preferred company' AS label
        WHERE EXISTS (
          SELECT 1
          FROM unnest(preference_context.target_organizations) preferred(value)
          WHERE lower(candidate.owner_name) = lower(preferred.value)
             OR lower(candidate.owner_name) LIKE '%' || lower(preferred.value) || '%'
        )
        UNION ALL
        SELECT 4.0::numeric AS score, industry.value AS label
        FROM unnest(candidate.owner_terms) industry(value)
        WHERE EXISTS (
          SELECT 1
          FROM unnest(preference_context.industries) preferred(value)
          WHERE lower(preferred.value) = lower(industry.value)
        )
        UNION ALL
        SELECT 5.0::numeric AS score, commitment.value AS label
        FROM jsonb_each_text(COALESCE(
          candidate.filter_labels -> 'commitments', '{}'::jsonb
        )) commitment
        WHERE EXISTS (
          SELECT 1
          FROM unnest(preference_context.commitments) preferred(value)
          WHERE translate(lower(preferred.value), ' _-', '') =
            translate(lower(commitment.value), ' _-', '')
        )
        UNION ALL
        SELECT 3.0::numeric AS score, priority.value AS label
        FROM unnest(preference_context.role_priorities) priority(value)
        WHERE length(priority.value) >= 3
          AND lower(candidate.search_text) LIKE
            '%' || lower(priority.value) || '%'
        UNION ALL
        SELECT 3.0::numeric AS score, funding.value AS label
        FROM unnest(candidate.funding_round_names) funding(value)
        WHERE EXISTS (
          SELECT 1
          FROM unnest(preference_context.funding_stages) preferred(value)
          WHERE lower(preferred.value) = lower(funding.value)
        )
        UNION ALL
        SELECT 2.0::numeric AS score, candidate.salary_currency AS label
        WHERE candidate.salary_currency IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM unnest(preference_context.payment_currencies) preferred(value)
            WHERE upper(preferred.value) = upper(candidate.salary_currency)
          )
      ) signal
    ) preference_match ON true
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
      + preference_score
      + owner_score
      + web3_score
      + CASE
          WHEN preferred_minimum_salary IS NULL
            OR preferred_salary_currency IS NULL THEN 0.0
          WHEN candidate_features.salary_currency IS NULL
            OR upper(candidate_features.salary_currency) <>
              upper(preferred_salary_currency) THEN 0.0
          WHEN COALESCE(
            candidate_features.maximum_salary,
            candidate_features.minimum_salary,
            candidate_features.salary
          ) >= preferred_minimum_salary THEN 6.0
          WHEN COALESCE(
            candidate_features.maximum_salary,
            candidate_features.minimum_salary,
            candidate_features.salary
          ) IS NOT NULL THEN -8.0
          ELSE 0.0
        END
      + CASE
          WHEN preferred_company_size_min IS NULL
            AND preferred_company_size_max IS NULL THEN 0.0
          WHEN headcount_estimate IS NULL THEN 0.0
          WHEN (
            preferred_company_size_min IS NULL
            OR headcount_estimate >= preferred_company_size_min
          ) AND (
            preferred_company_size_max IS NULL
            OR headcount_estimate <= preferred_company_size_max
          )
            THEN 3.0
          ELSE -3.0
        END
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
      ranked.preference_labels[1],
      CASE WHEN ranked.web3_score > 0 THEN 'Web3 beginner friendly' END,
      CASE WHEN ranked.owner_score > 0 THEN 'Company you explored' END,
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
