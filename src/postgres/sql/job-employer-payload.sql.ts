const canonicalWorkArrangementOption = (
  valueAlias: string,
  classificationExpression: string,
): string => `
  jsonb_strip_nulls(jsonb_build_object(
    'classification', ${classificationExpression},
    'mode', ${valueAlias} ->> 'mode',
    'scope', ${valueAlias} ->> 'scope',
    'includedCountries', COALESCE((
      SELECT jsonb_agg(upper(country) ORDER BY upper(country))
      FROM jsonb_array_elements_text(
        COALESCE(${valueAlias} -> 'includedCountries', '[]'::jsonb)
      ) country
      WHERE country ~* '^[A-Z]{2}$'
    ), '[]'::jsonb),
    'excludedCountries', COALESCE((
      SELECT jsonb_agg(upper(country) ORDER BY upper(country))
      FROM jsonb_array_elements_text(
        COALESCE(${valueAlias} -> 'excludedCountries', '[]'::jsonb)
      ) country
      WHERE country ~* '^[A-Z]{2}$'
    ), '[]'::jsonb),
    'includedRegions', COALESCE((
      SELECT jsonb_agg(region ORDER BY region)
      FROM jsonb_array_elements_text(
        COALESCE(${valueAlias} -> 'includedRegions', '[]'::jsonb)
      ) region
      WHERE region IN ('EU', 'Europe', 'EMEA', 'AMER', 'LATAM', 'APAC')
    ), '[]'::jsonb),
    'excludedRegions', COALESCE((
      SELECT jsonb_agg(region ORDER BY region)
      FROM jsonb_array_elements_text(
        COALESCE(${valueAlias} -> 'excludedRegions', '[]'::jsonb)
      ) region
      WHERE region IN ('EU', 'Europe', 'EMEA', 'AMER', 'LATAM', 'APAC')
    ), '[]'::jsonb),
    'requiredUtcBand', CASE
      WHEN ${valueAlias} -> 'requiredUtcBand' ->> 'minimumMinutes' IS NOT NULL
        AND ${valueAlias} -> 'requiredUtcBand' ->> 'maximumMinutes' IS NOT NULL
      THEN jsonb_build_object(
        'minimumUtcOffset',
          (${valueAlias} -> 'requiredUtcBand' ->> 'minimumMinutes')::numeric / 60.0,
        'maximumUtcOffset',
          (${valueAlias} -> 'requiredUtcBand' ->> 'maximumMinutes')::numeric / 60.0
      ) ELSE NULL END,
    'preferredUtcBand', CASE
      WHEN ${valueAlias} -> 'preferredUtcBand' ->> 'minimumMinutes' IS NOT NULL
        AND ${valueAlias} -> 'preferredUtcBand' ->> 'maximumMinutes' IS NOT NULL
      THEN jsonb_build_object(
        'minimumUtcOffset',
          (${valueAlias} -> 'preferredUtcBand' ->> 'minimumMinutes')::numeric / 60.0,
        'maximumUtcOffset',
          (${valueAlias} -> 'preferredUtcBand' ->> 'maximumMinutes')::numeric / 60.0
      ) ELSE NULL END,
    'residencyRequirements', COALESCE(
      ${valueAlias} -> 'residencyRequirements', '[]'::jsonb
    ),
    'workAuthorizationRequirements', COALESCE(
      ${valueAlias} -> 'workAuthorizations', '[]'::jsonb
    ),
    'sponsorshipStatus', COALESCE(
      ${valueAlias} ->> 'sponsorshipStatus', 'unstated'
    ),
    'officeCity', NULLIF(btrim(${valueAlias} ->> 'officeCity'), ''),
    'attendanceCadence', NULLIF(
      btrim(${valueAlias} ->> 'attendanceCadence'), ''
    ),
    'travelRequirement', NULLIF(
      btrim(${valueAlias} ->> 'travelRequirement'), ''
    ),
    'evidence', CASE
      WHEN NULLIF(btrim(${valueAlias} -> 'evidence' ->> 'quote'), '') IS NOT NULL
        AND (${valueAlias} -> 'evidence' ->> 'startOffset')::integer >= 0
        AND (${valueAlias} -> 'evidence' ->> 'endOffset')::integer
          > (${valueAlias} -> 'evidence' ->> 'startOffset')::integer
        AND (${valueAlias} -> 'evidence' ->> 'endOffset')::integer
          - (${valueAlias} -> 'evidence' ->> 'startOffset')::integer
          = length(${valueAlias} -> 'evidence' ->> 'quote')
        AND ${valueAlias} -> 'evidence' ->> 'trust' IN (
          'employer_body', 'employer_ats_field',
          'verified_employer_policy', 'aggregator'
        )
      THEN jsonb_build_array(jsonb_build_object(
        'quote', ${valueAlias} -> 'evidence' ->> 'quote',
        'startOffset',
          (${valueAlias} -> 'evidence' ->> 'startOffset')::integer,
        'endOffset', (${valueAlias} -> 'evidence' ->> 'endOffset')::integer,
        'source', ${valueAlias} -> 'evidence' ->> 'trust',
        'trust', ${valueAlias} -> 'evidence' ->> 'trust',
        'provenance', COALESCE(
          (${valueAlias} -> 'evidence' -> 'provenance')::text, '{}'
        )
      )) ELSE '[]'::jsonb END,
    'confidence', COALESCE(${valueAlias} ->> 'confidence', 'parsed')
  ))
`;

export const jobWorkArrangementPayload = (jobAlias = "job"): string => `
  jsonb_build_object(
    'classification', COALESCE(
      ${jobAlias}.work_arrangement ->> 'classification', 'unstated'
    ),
    'remoteOptions', COALESCE((
      SELECT jsonb_agg(
        ${canonicalWorkArrangementOption(
          "option_value",
          `COALESCE(${jobAlias}.work_arrangement ->> 'classification', 'unstated')`,
        )}
        ORDER BY
          option_value ->> 'mode',
          option_value ->> 'alternativeGroupKey',
          option_value ->> 'optionKey'
      )
      FROM jsonb_array_elements(
        COALESCE(${jobAlias}.work_arrangement -> 'remoteOptions', '[]'::jsonb)
      ) option_value
      WHERE option_value ->> 'mode' = 'remote'
    ), '[]'::jsonb),
    'hybridOptions', COALESCE((
      SELECT jsonb_agg(
        ${canonicalWorkArrangementOption(
          "option_value",
          `COALESCE(${jobAlias}.work_arrangement ->> 'classification', 'unstated')`,
        )}
        ORDER BY option_value ->> 'alternativeGroupKey', option_value ->> 'optionKey'
      )
      FROM jsonb_array_elements(
        COALESCE(${jobAlias}.work_arrangement -> 'hybridOptions', '[]'::jsonb)
      ) option_value
      WHERE option_value ->> 'mode' = 'hybrid'
    ), '[]'::jsonb),
    'onsiteOptions', COALESCE((
      SELECT jsonb_agg(
        ${canonicalWorkArrangementOption(
          "option_value",
          `COALESCE(${jobAlias}.work_arrangement ->> 'classification', 'unstated')`,
        )}
        ORDER BY option_value ->> 'alternativeGroupKey', option_value ->> 'optionKey'
      )
      FROM jsonb_array_elements(
        COALESCE(${jobAlias}.work_arrangement -> 'onsiteOptions', '[]'::jsonb)
      ) option_value
      WHERE option_value ->> 'mode' = 'onsite'
    ), '[]'::jsonb)
  )
`;

export const jobEmployerPayload = (
  basePayload: string,
  jobAlias = "job",
  organizationAlias = "organization",
  projectAlias = "project",
): string => `
  ${basePayload}
  || jsonb_build_object(
    'workArrangement', ${jobWorkArrangementPayload(jobAlias)}
  )
  || CASE
    WHEN ${jobAlias}.organization_id IS NOT NULL
      AND ${jobAlias}.project_id IS NULL
      AND ${organizationAlias}.payload IS NOT NULL
      THEN jsonb_build_object(
        'organization', ${organizationAlias}.payload - 'tags' - 'jobs',
        'project', NULL
      )
    WHEN ${jobAlias}.organization_id IS NULL
      AND ${jobAlias}.project_id IS NOT NULL
      AND ${projectAlias}.payload IS NOT NULL
      THEN jsonb_build_object(
        'organization', NULL,
        'project', ${projectAlias}.payload - 'tags' - 'jobs'
      )
    ELSE jsonb_build_object('organization', NULL, 'project', NULL)
  END
`;

export const jobEmployerJoins = (
  jobAlias = "job",
  organizationAlias = "organization",
  projectAlias = "project",
): string => `
  LEFT JOIN organization_search_documents ${organizationAlias}
    ON ${organizationAlias}.organization_id = ${jobAlias}.organization_id
   AND ${jobAlias}.project_id IS NULL
  LEFT JOIN project_search_documents ${projectAlias}
    ON ${projectAlias}.project_id = ${jobAlias}.project_id
   AND ${jobAlias}.organization_id IS NULL
`;
