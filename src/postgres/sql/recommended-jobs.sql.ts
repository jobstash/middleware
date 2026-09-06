import { recommendationSemanticCtes } from "./recommendation-semantic.sql";
import { RECOMMENDATION_EMBEDDING_VERSION } from "../recommendation-embedding.repository";
import {
  jobEmployerJoins,
  jobEmployerPayload,
} from "./job-employer-payload.sql";

// Transaction-local: continue past filtered/dead HNSW tuples after refreshes.
export const recommendationVectorSearchSettings =
  "SET LOCAL hnsw.iterative_scan = strict_order; SET LOCAL hnsw.ef_search = 100; SET LOCAL jit = off";

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
    SELECT translate(lower(source_job.seniority), ' _-', '') AS label_key,
      sum(activity.weight) AS weight
    FROM weighted_activity activity
    JOIN job_search_documents source_job
      ON source_job.job_node_id = activity.job_node_id
    WHERE NULLIF(btrim(source_job.seniority), '') IS NOT NULL
    GROUP BY translate(lower(source_job.seniority), ' _-', '')
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
      preferences.salary_currency,
      preferences.residence_country,
      COALESCE(preferences.languages, ARRAY[]::text[]) AS languages,
      COALESCE(preferences.education_level,
        target_user.properties #>> '{recommendationCareer,educationLevel}') AS education_level,
      COALESCE(preferences.showcase_repositories, ARRAY[]::text[]) AS showcase_repositories
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
        END * CASE WHEN EXISTS (
          SELECT 1 FROM unnest(preference_context.showcase_repositories) selected(url)
          WHERE regexp_replace(lower(selected.url), '/+$', '') =
            regexp_replace(lower(repository.properties ->> 'url'), '/+$', '')
        ) THEN 1.5 ELSE 1.0 END AS weight
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
      CROSS JOIN preference_context
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(repository.properties -> 'skills') = 'array'
            THEN repository.properties -> 'skills'
          ELSE '[]'::jsonb
        END
      ) repository_skill
      UNION ALL
      SELECT lower(skill.value), skill.value, 3.0::numeric
      FROM target_user
      JOIN graph_relationships edge ON edge.source_id = target_user.id
        AND edge.type = 'HAS_ADJACENT_REPO'
      JOIN graph_nodes repository ON repository.id = edge.target_id
        AND repository.label = 'UserAdjacentRepo'
      CROSS JOIN preference_context
      CROSS JOIN LATERAL jsonb_array_elements_text(CASE
        WHEN jsonb_typeof(repository.properties -> 'skills') = 'array'
        THEN repository.properties -> 'skills' ELSE '[]'::jsonb END) skill
      WHERE EXISTS (
        SELECT 1 FROM unnest(preference_context.showcase_repositories) selected(url)
        WHERE regexp_replace(lower(selected.url), '/+$', '') =
          regexp_replace(lower(repository.properties ->> 'url'), '/+$', '')
      )
    ) signal
    WHERE NULLIF(btrim(signal.label), '') IS NOT NULL
    GROUP BY signal.label_key
  ), ${recommendationSemanticCtes}, career AS MATERIALIZED (
    SELECT entry.value AS role
    FROM target_user
    CROSS JOIN LATERAL jsonb_array_elements(CASE
      WHEN jsonb_typeof(target_user.properties #> '{recommendationCareer,roles}') = 'array'
        THEN target_user.properties #> '{recommendationCareer,roles}'
      ELSE '[]'::jsonb END) entry
  ), user_location AS MATERIALIZED (
    SELECT location.properties ->> 'city' AS city,
      location.properties ->> 'country' AS country,
      location.properties ->> 'countryCode' AS country_code
    FROM target_user
    LEFT JOIN LATERAL (
      SELECT node.properties FROM graph_relationships edge
      JOIN graph_nodes node ON node.id = edge.target_id AND node.label = 'UserLocation'
      WHERE edge.source_id = target_user.id AND edge.type = 'HAS_LOCATION'
      ORDER BY node.id LIMIT 1
    ) location ON true
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
  ), funding_affinity AS MATERIALIZED (
    SELECT sum(ln(1 + funding.total) * activity.weight) / NULLIF(sum(activity.weight), 0) AS target_log_funding
    FROM weighted_activity activity
    JOIN job_search_documents source_job ON source_job.job_node_id = activity.job_node_id
    ${jobEmployerJoins("source_job")}
    CROSS JOIN LATERAL (
      SELECT sum(jsonb_numeric_value(round, 'raisedAmount')) AS total
      FROM jsonb_array_elements(COALESCE(
        COALESCE(organization.payload, project.payload) -> 'fundingRounds', '[]'::jsonb
      )) round
    ) funding
    WHERE activity.weight > 0 AND funding.total > 0
  ), investor_affinity AS MATERIALIZED (
    SELECT lower(investor) AS name, sum(activity.weight) AS weight
    FROM weighted_activity activity
    JOIN job_search_documents source_job ON source_job.job_node_id = activity.job_node_id
    CROSS JOIN LATERAL unnest(source_job.investor_names) investor
    WHERE activity.weight > 0
    GROUP BY lower(investor)
  ), candidates AS MATERIALIZED (
    SELECT document.*,
      COALESCE(job_semantics.score,0) AS semantic_job_score,
      COALESCE(company_semantics.score,0) AS semantic_company_score,
      COALESCE(job_semantics.supported_sentences,0) AS semantic_job_support,
      COALESCE(company_semantics.supported_sentences,0) AS semantic_company_support,
      COALESCE(document.organization_id, document.project_id) AS owner_key,
      COALESCE(organization.name, project.name) AS owner_name,
      COALESCE(organization.payload, project.payload) AS owner_payload,
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
    LEFT JOIN semantic_scores job_semantics ON job_semantics.kind='job' AND job_semantics.node_id=document.job_node_id
    LEFT JOIN semantic_scores company_semantics ON company_semantics.kind='employer'
      AND company_semantics.node_id=COALESCE(organization.organization_node_id,project.project_node_id)
    LEFT JOIN recommendation_embedding_documents job_vectors ON job_vectors.kind='job'
      AND job_vectors.node_id=document.job_node_id AND job_vectors.status='ready'
      AND job_vectors.version='${RECOMMENDATION_EMBEDDING_VERSION}'
      AND job_vectors.content_hash=md5(recommendation_embedding_content('job',document.job_node_id))
    WHERE document.online
      AND (NOT $3::boolean OR (job_vectors.node_id IS NOT NULL AND EXISTS (SELECT 1 FROM user_evidence)))
      AND (NOT $3::boolean OR NOT EXISTS (
        SELECT 1 FROM user_email_digest_consent_events sent
        WHERE sent.user_node_id = target_user.id AND sent.event_type = 'digest_sent'
          AND sent.occurred_at > now() - interval '28 days'
          AND sent.metadata -> 'jobIds' ? (document.payload ->> 'shortUUID')
      ))
      AND NOT document.blocked
      AND document.published_timestamp >=
        (extract(epoch FROM now() - interval '90 days') * 1000)::bigint
      AND num_nonnulls(document.organization_id, document.project_id) = 1
      AND (organization.payload IS NOT NULL OR project.payload IS NOT NULL)
      AND lower(COALESCE(
        organization.payload #>> '{profileStatus,name}',
        organization.payload ->> 'profileStatus',
        project.payload #>> '{status,name}', project.payload ->> 'status', ''
      )) NOT IN ('dead', 'inactive', 'closed', 'shutdown', 'shut down',
        'discontinued', 'defunct', 'support ended')
      AND NOT EXISTS (
        SELECT 1 FROM graph_relationships edge
        JOIN graph_nodes status ON status.id = edge.target_id
        WHERE edge.source_id = COALESCE(organization.organization_node_id, project.project_node_id)
          AND edge.type IN ('HAS_STATUS', 'HAS_PROFILE_STATUS')
          AND lower(COALESCE(status.properties ->> 'name', '')) IN
            ('dead', 'inactive', 'closed', 'shutdown', 'shut down', 'discontinued', 'defunct', 'support ended')
      )
      AND NOT EXISTS (
        SELECT 1 FROM graph_relationships membership
        JOIN graph_relationships info_edge ON info_edge.source_id = membership.source_id
          AND info_edge.type = 'HAS_PROFILE_INFO'
        JOIN graph_nodes info ON info.id = info_edge.target_id AND info.label = 'ProfileInfo'
        WHERE membership.target_id = COALESCE(organization.organization_node_id, project.project_node_id)
          AND membership.type IN ('PROFILE_HAS_ORGANIZATION', 'PROFILE_HAS_PROJECT')
          AND lower(COALESCE(info.properties ->> 'profileStatus', '')) IN ('inactive', 'closed')
      )
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
      COALESCE(related_skill_match.score,0) AS related_skill_score,
      COALESCE(seniority_match.score, 0) AS seniority_score,
      COALESCE(preference_match.score, 0) AS preference_score,
      COALESCE(location_match.score, 0) AS location_score,
      COALESCE(financial_match.score, 0) AS financial_score,
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
    CROSS JOIN user_location
    CROSS JOIN funding_affinity
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
      SELECT least(6.0,COALESCE(sum(related.strength),0)*2.0) AS score
      FROM graph_relationships tag_edge JOIN related_tags related ON related.tag_node_id=tag_edge.target_id
      JOIN graph_nodes tag ON tag.id=tag_edge.target_id
      WHERE tag_edge.source_id=candidate.job_node_id AND tag_edge.type='HAS_TAG'
        AND COALESCE(tag_edge.properties ->> 'isSoftSkill','false') <> 'true'
        AND NOT EXISTS (SELECT 1 FROM profile_skills exact WHERE exact.label_key=lower(tag.properties ->> 'name'))
    ) related_skill_match ON true
    LEFT JOIN LATERAL (
      SELECT max(affinity.weight) * 0.8 AS score
      FROM seniority_affinity affinity
      WHERE affinity.label_key = translate(lower(candidate.seniority), ' _-', '')
    ) seniority_match ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE((
        SELECT least(2.0, COALESCE(sum(affinity.weight), 0) * 0.15)
        FROM unnest(candidate.investor_names) investor
        JOIN investor_affinity affinity ON affinity.name = lower(investor)
      ), 0) + COALESCE((
        SELECT 2.0 * exp(-abs(ln(1 + sum(jsonb_numeric_value(round, 'raisedAmount')))
          - funding_affinity.target_log_funding))
        FROM jsonb_array_elements(COALESCE(candidate.owner_payload -> 'fundingRounds', '[]'::jsonb)) round
        HAVING sum(jsonb_numeric_value(round, 'raisedAmount')) > 0
          AND funding_affinity.target_log_funding IS NOT NULL
      ), 0) AS score
    ) financial_match ON true
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN length(user_location.city) >= 2 AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(
            COALESCE(candidate.work_arrangement -> 'onsiteOptions', '[]'::jsonb)
            || COALESCE(candidate.work_arrangement -> 'hybridOptions', '[]'::jsonb)
          ) option WHERE lower(option ->> 'officeCity') = lower(user_location.city)
        ) THEN 6.0
        WHEN length(user_location.country) >= 2
          AND lower(candidate.location) = lower(user_location.country) THEN 3.0
        WHEN COALESCE(preference_context.residence_country, user_location.country_code) IS NOT NULL AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(
            COALESCE(candidate.work_arrangement -> 'remoteOptions', '[]'::jsonb)
            || COALESCE(candidate.work_arrangement -> 'hybridOptions', '[]'::jsonb)
            || COALESCE(candidate.work_arrangement -> 'onsiteOptions', '[]'::jsonb)
          ) option WHERE option -> 'includedCountries' ? upper(COALESCE(
            preference_context.residence_country, user_location.country_code))
        ) THEN 3.0
        ELSE 0.0 END AS score
    ) location_match ON true
    LEFT JOIN LATERAL (
      SELECT least(COALESCE(sum(signal.score), 0), 30.0) AS score,
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
        SELECT 7.0::numeric AS score, candidate.seniority AS label
        WHERE EXISTS (
          SELECT 1
          FROM unnest(preference_context.seniority_levels) preferred(value)
          WHERE translate(lower(preferred.value), ' _-', '') =
            translate(lower(candidate.seniority), ' _-', '')
        )
        UNION ALL
        SELECT 10.0::numeric AS score, 'Preferred company' AS label
        WHERE EXISTS (
          SELECT 1
          FROM unnest(preference_context.target_organizations) preferred(value)
          WHERE lower(candidate.owner_name) = lower(preferred.value)
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
        SELECT 3.0::numeric AS score, funding.value AS label
        FROM unnest(candidate.funding_round_names) funding(value)
        WHERE EXISTS (
          SELECT 1
          FROM unnest(preference_context.funding_stages) preferred(value)
          WHERE lower(preferred.value) = lower(funding.value)
        )
        UNION ALL
        SELECT 4.0::numeric, 'Seniority from your recent CV role'
        WHERE cardinality(preference_context.seniority_levels) = 0
          AND translate(lower(candidate.seniority), ' _-', '') = (
            SELECT translate(lower(role ->> 'seniority'), ' _-', '') FROM career
            WHERE role ->> 'seniority' IS NOT NULL
              AND (role ->> 'current' = 'true' OR role ->> 'endDate' >=
                to_char(now() - interval '2 years', 'YYYY-MM-DD'))
            ORDER BY (role ->> 'current' = 'true') DESC,
              role ->> 'endDate' DESC NULLS LAST, role ->> 'startDate' DESC NULLS LAST
            LIMIT 1
          )
        UNION ALL
        SELECT 2.0::numeric, 'Company in your work history'
        WHERE EXISTS (SELECT 1 FROM career
          WHERE lower(role ->> 'company') = lower(candidate.owner_name))
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
      + related_skill_score
      + seniority_score
      + preference_score
      + semantic_job_score
      + semantic_company_score
      + location_score
      + financial_score
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
      ranked.preference_labels[1],
      CASE WHEN ranked.related_skill_score >= 1 THEN 'Related technical skills' END,
      CASE WHEN ranked.semantic_job_support >= 2 THEN 'Matches several requirements' END,
      CASE WHEN ranked.semantic_company_support >= 2 THEN 'Company aligns with your interests' END,
      CASE WHEN ranked.location_score >= 6 THEN 'Office in your city' END,
      CASE WHEN ranked.financial_score > 0 THEN 'Funding profile you explored' END,
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
