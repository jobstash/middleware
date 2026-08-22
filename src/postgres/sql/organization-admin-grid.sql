WITH selected_organizations AS (
  SELECT
    organization.organization_node_id,
    organization.payload,
    NULL::jsonb AS graph_properties,
    false AS from_graph
  FROM organization_search_documents organization
  UNION ALL
  SELECT
    banned.id,
    NULL::jsonb,
    banned.properties,
    true
  FROM graph_nodes banned
  WHERE banned.label = 'Organization'
    AND entity_property_is_banned(banned.properties)
    AND NOT EXISTS (
      SELECT 1
      FROM organization_search_documents existing
      WHERE existing.organization_node_id = banned.id
    )
), paged_organizations AS (
  SELECT
    selected.organization_node_id,
    selected.payload,
    selected.graph_properties,
    selected.from_graph,
    count(*) OVER() AS total_count
  FROM selected_organizations selected
  JOIN graph_nodes selected_node
    ON selected_node.id = selected.organization_node_id
  WHERE (
      $3::text IS NULL
      OR lower(COALESCE(selected.payload, selected.graph_properties)::text)
           LIKE '%' || lower($3) || '%'
    )
    AND (
      NOT $4::boolean
      OR lower(COALESCE(
           selected_node.properties ->> 'needsManualReview',
           'false'
         )) IN ('true', '1', 'yes', 'on')
    )
    AND (
      NOT $5::boolean
      OR entity_property_is_banned(selected_node.properties)
    )
  ORDER BY selected.organization_node_id
  LIMIT $1 OFFSET $2
)
SELECT CASE
  WHEN organization.from_graph THEN jsonb_build_object(
    'id', organization.graph_properties -> 'id',
    'orgId', COALESCE(
      organization.graph_properties -> 'orgId',
      organization.graph_properties -> 'id'
    ),
    'name', organization.graph_properties -> 'name',
    'normalizedName', organization.graph_properties -> 'normalizedName',
    'location', organization.graph_properties -> 'location',
    'logoUrl', organization.graph_properties -> 'logoUrl',
    'description', organization.graph_properties -> 'description',
    'summary', organization.graph_properties -> 'summary',
    'headcountEstimate', organization.graph_properties -> 'headcountEstimate',
    'altName', organization.graph_properties -> 'altName',
    'createdTimestamp', organization.graph_properties -> 'createdTimestamp',
    'updatedTimestamp', organization.graph_properties -> 'updatedTimestamp',
    'vertical', organization.graph_properties -> 'vertical',
    'verticalFirstAppliedTimestamp', organization.graph_properties -> 'verticalFirstAppliedTimestamp',
    'verticalAppliedTimestamp', organization.graph_properties -> 'verticalAppliedTimestamp',
    'verticalClassificationSource', organization.graph_properties -> 'verticalClassificationSource',
    'verticalClassificationProvider', organization.graph_properties -> 'verticalClassificationProvider',
    'verticalClassificationModel', organization.graph_properties -> 'verticalClassificationModel',
    'verticalClassificationReason', organization.graph_properties -> 'verticalClassificationReason',
    'websites', '[]'::jsonb,
    'aliases', '[]'::jsonb,
    'twitters', '[]'::jsonb,
    'githubs', '[]'::jsonb,
    'discords', '[]'::jsonb,
    'docs', '[]'::jsonb,
    'telegrams', '[]'::jsonb,
    'communities', '[]'::jsonb,
    'grants', '[]'::jsonb,
    'jobsites', '[]'::jsonb,
    'detectedJobsites', '[]'::jsonb,
    'projects', '[]'::jsonb,
    'needsManualReview', false,
    'manualReviewStatus', NULL,
    'manualReviewReason', NULL,
    'manualReviewSeverity', NULL,
    'manualReviewEvidence', '[]'::jsonb,
    'manualReviewProposedActions', '[]'::jsonb,
    'manualReviewUpdatedTimestamp', NULL,
    'banned', true
  )
  ELSE jsonb_build_object(
  'id', organization.payload -> 'id',
  'orgId', organization.payload -> 'orgId',
  'name', organization.payload -> 'name',
  'normalizedName', organization.payload -> 'normalizedName',
  'location', organization.payload -> 'location',
  'logoUrl', organization.payload -> 'logoUrl',
  'description', organization.payload -> 'description',
  'summary', organization.payload -> 'summary',
  'headcountEstimate', organization.payload -> 'headcountEstimate',
  'altName', organization.payload -> 'altName',
  'createdTimestamp', organization.payload -> 'createdTimestamp',
  'updatedTimestamp', organization.payload -> 'updatedTimestamp',
  'vertical', node.properties -> 'vertical',
  'verticalFirstAppliedTimestamp', node.properties -> 'verticalFirstAppliedTimestamp',
  'verticalAppliedTimestamp', node.properties -> 'verticalAppliedTimestamp',
  'verticalClassificationSource', node.properties -> 'verticalClassificationSource',
  'verticalClassificationProvider', node.properties -> 'verticalClassificationProvider',
  'verticalClassificationModel', node.properties -> 'verticalClassificationModel',
  'verticalClassificationReason', node.properties -> 'verticalClassificationReason',
  'websites', links.websites,
  'aliases', links.aliases,
  'twitters', links.twitters,
  'githubs', links.githubs,
  'discords', links.discords,
  'docs', links.docs,
  'telegrams', links.telegrams,
  'communities', COALESCE(organization.payload -> 'communities', '[]'::jsonb),
  'grants', COALESCE(organization.payload -> 'grants', '[]'::jsonb),
  'jobsites', links.jobsites,
  'detectedJobsites', links.detected_jobsites,
  'projects', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', project -> 'id',
      'name', project -> 'name'
    ))
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(organization.payload -> 'projects') = 'array'
          THEN organization.payload -> 'projects'
        ELSE '[]'::jsonb
      END
    ) project
    WHERE project ->> 'id' IS NOT NULL
  ), '[]'::jsonb),
  'needsManualReview', COALESCE(
    (node.properties ->> 'needsManualReview')::boolean,
    false
  ),
  'manualReviewStatus', node.properties ->> 'manualReviewStatus',
  'manualReviewReason', node.properties ->> 'manualReviewReason',
  'manualReviewSeverity', node.properties ->> 'manualReviewSeverity',
  'manualReviewEvidence', CASE
    WHEN jsonb_typeof(node.properties -> 'manualReviewEvidence') = 'array'
      THEN node.properties -> 'manualReviewEvidence'
    ELSE '[]'::jsonb
  END,
  'manualReviewProposedActions', CASE
    WHEN jsonb_typeof(node.properties -> 'manualReviewProposedActions') = 'array'
      THEN node.properties -> 'manualReviewProposedActions'
    ELSE '[]'::jsonb
  END,
  'manualReviewUpdatedTimestamp', jsonb_numeric_value(
    node.properties,
    'manualReviewUpdatedTimestamp'
  ),
  'banned', entity_property_is_banned(node.properties)
  )
END AS payload,
organization.total_count
FROM paged_organizations organization
JOIN graph_nodes node ON node.id = organization.organization_node_id
CROSS JOIN LATERAL (
  SELECT
    COALESCE(to_jsonb(array_agg(DISTINCT related.properties ->> 'url')
      FILTER (
        WHERE relationship.type = 'HAS_WEBSITE'
          AND related.properties ->> 'url' IS NOT NULL
      )), '[]'::jsonb) AS websites,
    COALESCE(to_jsonb(array_agg(DISTINCT related.properties ->> 'name')
      FILTER (
        WHERE relationship.type = 'HAS_ORGANIZATION_ALIAS'
          AND related.properties ->> 'name' IS NOT NULL
      )), '[]'::jsonb) AS aliases,
    COALESCE(to_jsonb(array_agg(DISTINCT related.properties ->> 'username')
      FILTER (
        WHERE relationship.type = 'HAS_TWITTER'
          AND related.properties ->> 'username' IS NOT NULL
      )), '[]'::jsonb) AS twitters,
    COALESCE(to_jsonb(array_agg(DISTINCT related.properties ->> 'login')
      FILTER (
        WHERE relationship.type = 'HAS_GITHUB'
          AND related.properties ->> 'login' IS NOT NULL
      )), '[]'::jsonb) AS githubs,
    COALESCE(to_jsonb(array_agg(DISTINCT related.properties ->> 'invite')
      FILTER (
        WHERE relationship.type = 'HAS_DISCORD'
          AND related.properties ->> 'invite' IS NOT NULL
      )), '[]'::jsonb) AS discords,
    COALESCE(to_jsonb(array_agg(DISTINCT related.properties ->> 'url')
      FILTER (
        WHERE relationship.type = 'HAS_DOCSITE'
          AND related.properties ->> 'url' IS NOT NULL
      )), '[]'::jsonb) AS docs,
    COALESCE(to_jsonb(array_agg(DISTINCT related.properties ->> 'username')
      FILTER (
        WHERE relationship.type = 'HAS_TELEGRAM'
          AND related.properties ->> 'username' IS NOT NULL
      )), '[]'::jsonb) AS telegrams,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', related.properties -> 'id',
      'url', related.properties -> 'url',
      'type', related.properties -> 'type',
      'lastImportAttemptTimestamp', jsonb_numeric_value(
        related.properties,
        'lastImportAttemptTimestamp'
      ),
      'lastSuccessfulImportTimestamp', jsonb_numeric_value(
        related.properties,
        'lastSuccessfulImportTimestamp'
      ),
      'lastNewJobTimestamp', jsonb_numeric_value(
        related.properties,
        'lastNewJobTimestamp'
      )
    )) FILTER (
      WHERE relationship.type = 'HAS_JOBSITE'
        AND related.label = 'Jobsite'
        AND related.properties ->> 'id' IS NOT NULL
    ), '[]'::jsonb) AS jobsites,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', related.properties -> 'id',
      'url', related.properties -> 'url',
      'type', related.properties -> 'type'
    )) FILTER (
      WHERE relationship.type = 'HAS_JOBSITE'
        AND related.label = 'DetectedJobsite'
        AND related.properties ->> 'id' IS NOT NULL
    ), '[]'::jsonb) AS detected_jobsites
  FROM graph_relationships relationship
  JOIN graph_nodes related ON related.id = relationship.target_id
  WHERE relationship.source_id = node.id
) links
ORDER BY organization.organization_node_id
