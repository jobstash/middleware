/** Last-touch attribution, seven-day window. Email delivery is NOT an impression. */
export const recommendationMetricsSql = `
WITH exposures AS MATERIALIZED (
  SELECT user_node_id, job_node_id, date_trunc('day', occurred_at) AS day,
    surface, COALESCE(metadata ->> 'rankingVersion', 'legacy') AS version,
    occurred_at AS exposed_at, position
  FROM user_activity_events
  WHERE event_type = 'job_impression' AND surface = 'jobs_for_me'
    AND position >= 0 AND position < $2
    AND occurred_at >= now() - make_interval(days => $1::integer)
  UNION ALL
  SELECT sent.user_node_id, job.id, date_trunc('day', sent.occurred_at),
    'weekly_email', COALESCE(sent.metadata ->> 'rankingVersion', 'legacy'),
    sent.occurred_at, (item.ordinality - 1)::integer
  FROM user_email_digest_consent_events sent
  CROSS JOIN LATERAL jsonb_array_elements_text(
    COALESCE(sent.metadata -> 'jobIds', '[]'::jsonb)
  ) WITH ORDINALITY item(short_id, ordinality)
  JOIN graph_nodes job ON job.label = 'StructuredJobpost'
    AND job.properties ->> 'shortUUID' = item.short_id
  WHERE sent.event_type = 'digest_sent' AND item.ordinality <= $2
    AND sent.occurred_at >= now() - make_interval(days => $1::integer)
), cohorts AS MATERIALIZED (
  SELECT user_node_id, job_node_id, day, surface, version, min(exposed_at) AS exposed_at
  FROM exposures GROUP BY user_node_id, job_node_id, day, surface, version
), attributed AS MATERIALIZED (
  SELECT DISTINCT ON (action.id) exposure.*, action.event_type, action.occurred_at AS acted_at
  FROM user_activity_events action
  JOIN exposures exposure ON exposure.user_node_id = action.user_node_id
      AND exposure.job_node_id = action.job_node_id
      AND action.occurred_at >= exposure.exposed_at
      AND action.occurred_at < exposure.exposed_at + interval '7 days'
  WHERE action.event_type IN ('job_view', 'job_apply', 'job_bookmark')
    AND action.occurred_at >= now() - make_interval(days => $1::integer)
  ORDER BY action.id, exposure.exposed_at DESC, exposure.surface
), converted AS (
  SELECT user_node_id, job_node_id, day, surface, version,
    bool_or(event_type = 'job_view') AS clicked,
    bool_or(event_type = 'job_apply') AS applied,
    bool_or(event_type = 'job_bookmark') AS saved
  FROM attributed GROUP BY user_node_id, job_node_id, day, surface, version
), first_applies AS (
  SELECT exposure.user_node_id, exposure.day, exposure.surface, exposure.version,
    extract(epoch FROM (min(action.acted_at) - min(exposure.exposed_at))) AS seconds
  FROM cohorts exposure
  JOIN attributed action ON action.user_node_id = exposure.user_node_id
    AND action.day = exposure.day AND action.surface = exposure.surface
    AND action.version = exposure.version AND action.event_type = 'job_apply'
  GROUP BY exposure.user_node_id, exposure.day, exposure.surface, exposure.version
), daily AS (
  SELECT exposure.day::date::text AS day, exposure.surface, exposure.version,
    count(*)::integer AS exposures,
    count(*) FILTER (WHERE converted.clicked)::integer AS clicks,
    count(*) FILTER (WHERE converted.applied)::integer AS applies,
    count(*) FILTER (WHERE converted.saved)::integer AS saves,
    count(*) FILTER (WHERE converted.clicked)::float / NULLIF(count(*), 0) AS "clickRate",
    count(*) FILTER (WHERE converted.applied)::float / NULLIF(count(*), 0) AS "applyRate",
    count(*) FILTER (WHERE converted.saved)::float / NULLIF(count(*), 0) AS "saveRate",
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds)
      FROM first_applies first_apply WHERE first_apply.day = exposure.day
        AND first_apply.surface = exposure.surface AND first_apply.version = exposure.version
    ) AS "medianSecondsToFirstApply",
    exposure.day + interval '8 days' <= now() AS mature
  FROM cohorts exposure
  LEFT JOIN converted USING (user_node_id, job_node_id, day, surface, version)
  GROUP BY exposure.day, exposure.surface, exposure.version
), mail AS (
  SELECT sent.id, EXISTS (
    SELECT 1 FROM user_email_digest_consent_events event
    WHERE event.user_node_id = sent.user_node_id AND event.event_type = 'unsubscribed'
      AND event.occurred_at >= sent.occurred_at
      AND event.occurred_at < sent.occurred_at + interval '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM user_email_digest_consent_events newer
        WHERE newer.user_node_id = sent.user_node_id AND newer.event_type = 'digest_sent'
          AND newer.occurred_at > sent.occurred_at AND newer.occurred_at <= event.occurred_at
      )
  ) AS unsubscribed
  FROM user_email_digest_consent_events sent
  WHERE sent.event_type = 'digest_sent'
    AND sent.occurred_at >= now() - make_interval(days => $1::integer)
)
SELECT jsonb_build_object(
  'days', $1::integer, 'k', $2::integer, 'attributionDays', 7,
  'daily', COALESCE((SELECT jsonb_agg(to_jsonb(daily) ORDER BY day DESC, surface, version) FROM daily), '[]'::jsonb),
  'email', (SELECT jsonb_build_object('sent', count(*),
    'unsubscribed', count(*) FILTER (WHERE unsubscribed),
    'unsubscribeRate', count(*) FILTER (WHERE unsubscribed)::float / NULLIF(count(*), 0)
  ) FROM mail)
) AS data
`;
