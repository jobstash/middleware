-- Candidate generation uses committed workplace options, never employer HQ.
-- Unknown geography is distinct from a known incompatibility and is not scored.
CREATE OR REPLACE FUNCTION candidate_geo_place(
  requested_name text, country_hint text DEFAULT NULL, requested_kinds text[] DEFAULT NULL
) RETURNS text LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT place.place_id
  FROM place_reference place
  WHERE place.place_id = resolve_place_alias(requested_name, requested_kinds, country_hint)
    AND (requested_kinds IS NULL OR place.kind = ANY(requested_kinds))
  UNION ALL
  SELECT place.place_id FROM place_reference place
  WHERE place.kind = 'country' AND place.country_code = upper(btrim(requested_name))
    AND requested_name ~* '^[a-z]{2}$'
    AND (requested_kinds IS NULL OR 'country' = ANY(requested_kinds))
    AND NOT EXISTS (
      SELECT 1 FROM place_reference resolved
      WHERE resolved.place_id = resolve_place_alias(requested_name, requested_kinds, country_hint)
        AND (requested_kinds IS NULL OR resolved.kind = ANY(requested_kinds))
    )
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION candidate_geo_location(
  location_text text, country_hint text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
DECLARE
  resolved text;
  parts text[];
  hint text := country_hint;
BEGIN
  IF hint IS NOT NULL THEN
    SELECT country_code INTO hint FROM place_reference
    WHERE place_id = candidate_geo_place(hint, NULL, ARRAY['country']);
  END IF;
  resolved := candidate_geo_place(location_text, hint);
  IF resolved IS NOT NULL THEN RETURN resolved; END IF;
  parts := regexp_split_to_array(location_text, '\s*,\s*');
  IF cardinality(parts) < 2 THEN RETURN NULL; END IF;
  IF hint IS NULL THEN
    SELECT country_code INTO hint FROM place_reference
    WHERE place_id = candidate_geo_place(parts[cardinality(parts)], NULL, ARRAY['country']);
  END IF;
  -- Exact comma-delimited components are aliases, not substring city matches.
  RETURN candidate_geo_place(parts[1], hint, ARRAY['city', 'administrative_area']);
END
$$;

CREATE OR REPLACE FUNCTION candidate_geo_context(source_context jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
DECLARE
  location jsonb := source_context -> 'location';
  current_place text;
  country_place text;
  country text;
  destination text;
  destination_place text;
  destinations jsonb := '[]'::jsonb;
  unresolved_destinations boolean := false;
  zones text[];
  place_row place_reference%ROWTYPE;
BEGIN
  country_place := candidate_geo_place(COALESCE(
    NULLIF(location ->> 'countryCode', ''), NULLIF(location ->> 'country', ''),
    source_context ->> 'residenceCountry'
  ), NULL, ARRAY['country']);
  SELECT country_code INTO country FROM place_reference WHERE place_id = country_place;
  IF NULLIF(location ->> 'city', '') IS NOT NULL THEN
    current_place := candidate_geo_place(location ->> 'city', country, ARRAY['city']);
  ELSIF NULLIF(location ->> 'state', '') IS NOT NULL THEN
    current_place := candidate_geo_place(location ->> 'state', country, ARRAY['administrative_area']);
  END IF;
  current_place := COALESCE(current_place,
    candidate_geo_location(source_context ->> 'currentLocation', country), country_place);
  SELECT * INTO place_row FROM place_reference WHERE place_id = current_place;
  country := COALESCE(place_row.country_code, country);
  zones := place_row.timezone_ids;
  IF NULLIF(source_context ->> 'ianaTimezone', '') IS NOT NULL THEN
    SELECT ARRAY[name] INTO zones FROM pg_timezone_names
    WHERE name = source_context ->> 'ianaTimezone';
  END IF;
  IF source_context ->> 'relocation' = 'specific_locations' THEN
    FOR destination IN
      SELECT value FROM jsonb_array_elements_text(CASE
        WHEN jsonb_typeof(source_context -> 'relocationLocations') = 'array'
          AND jsonb_array_length(source_context -> 'relocationLocations') > 0
          THEN source_context -> 'relocationLocations'
        ELSE to_jsonb(regexp_split_to_array(source_context ->> 'destinations', '[;\n]+'))
      END)
    LOOP
      destination_place := candidate_geo_location(destination);
      IF destination_place IS NOT NULL THEN
        destinations := destinations || to_jsonb(destination_place);
      ELSIF upper(btrim(destination)) IN ('EU', 'AMER') THEN
        SELECT destinations || COALESCE(jsonb_agg(place_id), '[]'::jsonb) INTO destinations
        FROM place_reference WHERE kind = 'country'
          AND candidate_geo_region(country_code, upper(btrim(destination)));
      ELSE unresolved_destinations := true;
      END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object(
    'placeId', current_place, 'kind', place_row.kind, 'countryCode', country,
    'timezoneIds', COALESCE(to_jsonb(zones), '[]'::jsonb),
    'utcOffsetMinutes', CASE WHEN jsonb_typeof(source_context -> 'utcOffset') = 'number'
      AND (source_context ->> 'utcOffset')::numeric BETWEEN -12 AND 14
      THEN (source_context ->> 'utcOffset')::numeric * 60 END,
    'relocation', source_context -> 'relocation', 'relocationPlaceIds', destinations,
    'unresolvedDestinations', unresolved_destinations, 'source', source_context
  );
END
$$;

-- Regions reuse the catalog containment closure. EU is a legal membership set,
-- not a continent; this is the same membership used by job-preference-matcher.
CREATE OR REPLACE FUNCTION candidate_geo_region(country text, region text)
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN country IS NULL THEN NULL
    WHEN region = 'EU' THEN upper(country) = ANY(string_to_array(
      'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE', ' '))
    WHEN region = 'AMER' THEN EXISTS (
      SELECT 1 FROM place_reference country_place JOIN place_reference ancestor
        ON ancestor.place_id = ANY(country_place.ancestor_place_ids)
      WHERE country_place.kind = 'country' AND country_place.country_code = upper(country)
        AND ancestor.normalized_name IN ('north-america', 'south-america')
    )
    WHEN candidate_geo_place(region, NULL, ARRAY['business_region', 'continent', 'world_region']) IS NULL THEN NULL
    ELSE EXISTS (
      SELECT 1 FROM place_reference country_place
      WHERE country_place.kind = 'country' AND country_place.country_code = upper(country)
        AND candidate_geo_place(region, NULL, ARRAY['business_region', 'continent', 'world_region'])
          = ANY(country_place.ancestor_place_ids)
    ) END
$$;

CREATE OR REPLACE FUNCTION job_candidate_geo_options(structured_id bigint)
RETURNS jsonb LANGUAGE sql STABLE PARALLEL SAFE AS $$
  WITH latest AS MATERIALIZED (
    SELECT DISTINCT ON (extraction.raw_job_node_id, extraction.jobsite_node_id)
      extraction.raw_job_node_id, extraction.jobsite_node_id, extraction.extractor_version
    FROM graph_relationships relationship
    JOIN job_availability_extractions extraction ON extraction.raw_job_node_id = relationship.source_id
    WHERE relationship.target_id = structured_id AND relationship.type = 'HAS_STRUCTURED_JOBPOST'
    ORDER BY extraction.raw_job_node_id, extraction.jobsite_node_id,
      extraction.extracted_at DESC, extraction.extractor_version DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'optionKey', option.option_key, 'alternativeGroupKey', option.alternative_group_key,
    'mode', option.mode, 'scope', option.scope,
    'includedCountries', option.countries, 'excludedCountries', option.excluded_countries,
    'includedRegions', option.regions, 'excludedRegions', option.excluded_regions,
    'requiredMinimumUtcOffsetMinutes', COALESCE(option.required_minimum_utc_offset_minutes,
      CASE WHEN option.timezone_preference_strength <> 'preferred' THEN option.minimum_utc_offset_minutes END),
    'requiredMaximumUtcOffsetMinutes', COALESCE(option.required_maximum_utc_offset_minutes,
      CASE WHEN option.timezone_preference_strength <> 'preferred' THEN option.maximum_utc_offset_minutes END),
    'preferredMinimumUtcOffsetMinutes', option.preferred_minimum_utc_offset_minutes,
    'preferredMaximumUtcOffsetMinutes', option.preferred_maximum_utc_offset_minutes,
    'residencyRequirements', CASE WHEN cardinality(option.residency_requirements) > 0
      THEN option.residency_requirements ELSE array_remove(ARRAY[option.residency_requirement], NULL) END,
    'workAuthorizationRequirements', CASE WHEN cardinality(option.work_authorizations) > 0
      THEN option.work_authorizations ELSE array_remove(ARRAY[option.work_authorization], NULL) END,
    'sponsorshipStatus', option.sponsorship_status,
    'officeCity', COALESCE(option.office_city, option.office_location ->> 'city', option.office_location ->> 'text'),
    'officeCountry', COALESCE(option.office_location ->> 'countryCode', option.office_location ->> 'country',
      CASE WHEN cardinality(option.countries) = 1 THEN option.countries[1] END),
    'officePlaceId', option.office_location ->> 'placeId',
    'attendanceCadence', option.attendance_cadence, 'travelRequirement', option.travel_requirement,
    'confidence', option.arrangement_confidence
  ) ORDER BY option.raw_job_node_id, option.jobsite_node_id, option.option_key), '[]'::jsonb)
  FROM latest JOIN job_work_location_options option USING(raw_job_node_id, jobsite_node_id, extractor_version)
$$;

CREATE OR REPLACE FUNCTION candidate_geo_option_status(
  workplace jsonb, candidate jsonb, classification text
) RETURNS text LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
DECLARE
  mode text := workplace ->> 'mode';
  country text := candidate ->> 'countryCode';
  current_place text := candidate ->> 'placeId';
  office_place text;
  office_country text;
  required_place text;
  requirement text;
  region text;
  zone text;
  sample timestamptz;
  utc_minutes numeric;
  minimum_utc integer := (workplace ->> 'requiredMinimumUtcOffsetMinutes')::integer;
  maximum_utc integer := (workplace ->> 'requiredMaximumUtcOffsetMinutes')::integer;
  unknown boolean := false;
  matched boolean;
  relocation boolean := candidate ->> 'relocation' = 'open_anywhere';
BEGIN
  IF classification IS NULL OR classification IN ('unstated', 'conflicting', 'remote_unqualified')
    OR COALESCE(workplace ->> 'confidence', '') NOT IN ('source_stated', 'parsed')
    OR mode NOT IN ('remote', 'onsite', 'hybrid') THEN RETURN 'unknown'; END IF;
  IF mode = 'remote' AND classification <> 'verified_remote' THEN RETURN 'unknown'; END IF;

  IF jsonb_array_length(workplace -> 'excludedCountries') > 0 THEN
    IF country IS NULL THEN unknown := true;
    ELSIF workplace -> 'excludedCountries' ? country THEN RETURN 'ineligible'; END IF;
  END IF;
  FOR region IN SELECT value FROM jsonb_array_elements_text(workplace -> 'excludedRegions') LOOP
    matched := candidate_geo_region(country, region);
    IF matched THEN RETURN 'ineligible'; END IF;
    IF matched IS NULL THEN unknown := true; END IF;
  END LOOP;
  IF jsonb_array_length(workplace -> 'includedCountries') > 0 THEN
    IF country IS NULL THEN unknown := true;
    ELSIF NOT workplace -> 'includedCountries' ? country THEN RETURN 'ineligible'; END IF;
  END IF;
  IF jsonb_array_length(workplace -> 'includedRegions') > 0 THEN
    SELECT bool_or(candidate_geo_region(country, value)) INTO matched
    FROM jsonb_array_elements_text(workplace -> 'includedRegions');
    IF matched IS FALSE THEN RETURN 'ineligible'; END IF;
    IF matched IS NULL THEN unknown := true; END IF;
  END IF;

  -- A residency clause is not a citizenship/work-authorization clause. Free text
  -- that has no exact canonical place interpretation remains unresolved.
  FOR requirement IN SELECT value FROM jsonb_array_elements_text(workplace -> 'residencyRequirements') LOOP
    IF upper(btrim(requirement)) IN ('EU', 'AMER') THEN
      matched := candidate_geo_region(country, upper(btrim(requirement)));
      IF matched IS FALSE THEN RETURN 'ineligible'; END IF;
      IF matched IS NULL THEN unknown := true; END IF;
      CONTINUE;
    END IF;
    required_place := candidate_geo_location(requirement);
    IF required_place IS NULL THEN unknown := true;
    ELSIF current_place IS NULL THEN unknown := true;
    ELSIF NOT EXISTS (SELECT 1 FROM place_reference location
      WHERE location.place_id = current_place
        AND (location.place_id = required_place OR required_place = ANY(location.ancestor_place_ids)))
      THEN RETURN 'ineligible';
    END IF;
  END LOOP;

  IF mode = 'remote' THEN
    IF workplace ->> 'scope' NOT IN ('global', 'country_list', 'region', 'region_list')
      OR (workplace ->> 'scope' = 'country_list' AND jsonb_array_length(workplace -> 'includedCountries') = 0)
      OR (workplace ->> 'scope' IN ('region', 'region_list') AND jsonb_array_length(workplace -> 'includedRegions') = 0)
      THEN unknown := true;
    END IF;
    IF NULLIF(btrim(workplace ->> 'attendanceCadence'), '') IS NOT NULL
      OR NULLIF(btrim(workplace ->> 'travelRequirement'), '') IS NOT NULL THEN unknown := true; END IF;
  ELSE
    SELECT country_code INTO office_country FROM place_reference
      WHERE place_id = candidate_geo_place(workplace ->> 'officeCountry', NULL, ARRAY['country']);
    SELECT place_id INTO office_place FROM place_reference
      WHERE place_id = workplace ->> 'officePlaceId' AND kind IN ('city', 'administrative_area');
    office_place := COALESCE(office_place,
      candidate_geo_location(workplace ->> 'officeCity', office_country));
    IF office_place IS NULL THEN RETURN 'unknown'; END IF;
    IF relocation THEN NULL;
    ELSIF current_place IS NULL THEN unknown := true;
    ELSIF candidate ->> 'kind' <> 'city'
      OR EXISTS (SELECT 1 FROM place_reference office WHERE office.place_id = office_place AND office.kind <> 'city') THEN
      IF EXISTS (SELECT 1 FROM place_reference office WHERE office.place_id = office_place
        AND office.country_code IS DISTINCT FROM country) THEN RETURN 'ineligible'; END IF;
      unknown := true;
    ELSE
      -- Reuse explicit place containment, not a made-up distance or same-country
      -- commute. Different cities sharing a province/country are not equivalent.
      SELECT EXISTS (
        SELECT 1 FROM place_reference local_place, place_reference office
        WHERE local_place.place_id = current_place AND office.place_id = office_place
          AND local_place.kind = 'city'
          AND office.kind = 'city'
          AND (local_place.place_id = office.place_id
            OR local_place.place_id = ANY(office.ancestor_place_ids)
            OR office.place_id = ANY(local_place.ancestor_place_ids))
      ) INTO matched;
      IF NOT matched THEN RETURN 'ineligible'; END IF;
    END IF;
  END IF;
  IF minimum_utc IS NOT NULL OR maximum_utc IS NOT NULL THEN
    IF jsonb_array_length(COALESCE(candidate -> 'timezoneIds', '[]'::jsonb)) = 0 THEN
      utc_minutes := (candidate ->> 'utcOffsetMinutes')::numeric;
      IF utc_minutes IS NULL THEN unknown := true;
      ELSIF (minimum_utc IS NOT NULL AND utc_minutes < minimum_utc)
        OR (maximum_utc IS NOT NULL AND utc_minutes > maximum_utc) THEN RETURN 'ineligible'; END IF;
    ELSE
      -- Check both seasonal offsets; a DST-boundary coincidence is not eligibility.
      FOR zone IN SELECT value FROM jsonb_array_elements_text(candidate -> 'timezoneIds') LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = zone) THEN unknown := true; CONTINUE; END IF;
        FOREACH sample IN ARRAY ARRAY[date_trunc('year', now()) + interval '14 days',
          date_trunc('year', now()) + interval '6 months 14 days'] LOOP
          utc_minutes := extract(epoch FROM ((sample AT TIME ZONE zone) - (sample AT TIME ZONE 'UTC'))) / 60;
          IF (minimum_utc IS NOT NULL AND utc_minutes < minimum_utc)
            OR (maximum_utc IS NOT NULL AND utc_minutes > maximum_utc) THEN RETURN 'ineligible'; END IF;
        END LOOP;
      END LOOP;
    END IF;
  END IF;
  RETURN CASE WHEN unknown THEN 'unknown' ELSE 'eligible' END;
END
$$;

CREATE OR REPLACE FUNCTION job_candidate_geo_eligibility(structured_id bigint, candidate jsonb)
RETURNS text LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
DECLARE
  classification text;
  workplace jsonb;
  status text;
  has_unknown boolean := COALESCE((candidate ->> 'unresolvedDestinations')::boolean, false);
  destination text;
  destination_context jsonb;
  destination_row place_reference%ROWTYPE;
  options jsonb := job_candidate_geo_options(structured_id);
BEGIN
  SELECT work_arrangement ->> 'classification' INTO classification
    FROM job_search_documents WHERE job_node_id = structured_id;
  IF jsonb_array_length(options) = 0 THEN RETURN 'unknown'; END IF;
  FOR workplace IN SELECT value FROM jsonb_array_elements(options) LOOP
    status := candidate_geo_option_status(workplace, candidate, classification);
    IF status = 'eligible' THEN RETURN status; END IF;
    has_unknown := has_unknown OR status = 'unknown';
    IF candidate ->> 'relocation' IN ('specific_locations', 'open_anywhere') THEN
      FOR destination IN
        SELECT value FROM jsonb_array_elements_text(candidate -> 'relocationPlaceIds')
        UNION
        SELECT candidate_geo_location(workplace ->> 'officeCity', workplace ->> 'officeCountry')
          WHERE candidate ->> 'relocation' = 'open_anywhere' AND workplace ->> 'mode' IN ('onsite', 'hybrid')
        UNION
        SELECT candidate_geo_place(value, NULL, ARRAY['country'])
          FROM jsonb_array_elements_text(workplace -> 'includedCountries')
          WHERE candidate ->> 'relocation' = 'open_anywhere'
        UNION
        SELECT country_place.place_id FROM place_reference country_place
        WHERE country_place.kind = 'country' AND (
          (candidate ->> 'relocation' = 'open_anywhere' AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(workplace -> 'includedRegions') region
            WHERE candidate_geo_region(country_place.country_code, region)
          ))
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(candidate -> 'relocationPlaceIds') requested
            WHERE requested = ANY(country_place.ancestor_place_ids)
          )
        )
      LOOP
        IF destination IS NULL THEN CONTINUE; END IF;
        SELECT * INTO destination_row FROM place_reference WHERE place_id = destination;
        destination_context := candidate || jsonb_build_object('placeId', destination,
          'kind', destination_row.kind, 'countryCode', destination_row.country_code,
          'timezoneIds', to_jsonb(destination_row.timezone_ids), 'utcOffsetMinutes', NULL);
        -- An explicit country/region destination admits offices contained by it.
        IF workplace ->> 'mode' IN ('onsite', 'hybrid') THEN
          destination_context := destination_context || jsonb_build_object('relocation', CASE
            WHEN EXISTS (SELECT 1 FROM place_reference office
              WHERE office.place_id = candidate_geo_location(workplace ->> 'officeCity', workplace ->> 'officeCountry')
                AND (office.place_id = destination OR destination = ANY(office.ancestor_place_ids)))
              THEN 'open_anywhere' ELSE NULL END);
        END IF;
        status := candidate_geo_option_status(workplace, destination_context, classification);
        IF status = 'eligible' THEN RETURN status; END IF;
        has_unknown := has_unknown OR status = 'unknown';
      END LOOP;
    END IF;
  END LOOP;
  RETURN CASE WHEN has_unknown THEN 'unknown' ELSE 'ineligible' END;
END
$$;
