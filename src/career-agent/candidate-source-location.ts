import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { candidateScreeningSource } from "./candidate-document-provenance";

export const CANDIDATE_SOURCE_MATCHING_VERSION = 4;
export const CANDIDATE_SOURCE_PROFILE_VERSION = 1;

export const SOURCE_PROFILE_PREFERENCE_COLUMNS = {
  workModes: "work_modes", utcOffset: "utc_offset_minutes", attendancePreference: "attendance_preference",
  travelTolerance: "travel_tolerance", searchStatus: "search_status", rolePriorities: "role_priorities",
  targetOrganizations: "target_organizations", languages: "languages", jobCategories: "job_categories",
  seniorityLevels: "seniority_levels", educationLevel: "education_level", companySizeMin: "company_size_min",
  companySizeMax: "company_size_max", industries: "industries", preferredSkills: "preferred_skills",
  minimumSalary: "minimum_salary", salaryCurrency: "salary_currency", fundingStages: "funding_stages",
  paymentCurrencies: "payment_currencies", commitments: "commitments", showcaseRepositories: "showcase_repositories",
} as const;

type SourceDocument = {
  content_hash: string;
  source_text: string | null;
  parsed_result: Record<string, unknown> | null;
  extraction_provenance?: unknown;
};

/** A cache attestation, not a model-provided fact or a global profile mutation. */
export function candidateSourceParseReady(document: SourceDocument): boolean {
  const context = document.parsed_result?.matchingContext;
  if (!context || typeof context !== "object" || Array.isArray(context)) return false;
  const saved = context as Record<string, unknown>;
  const projection = candidateScreeningSource(document).candidate_cv;
  return saved.version === CANDIDATE_SOURCE_MATCHING_VERSION && saved.contentHash === document.content_hash &&
    saved.sourceTextHash === createHash("md5").update(document.source_text ?? "").digest("hex") &&
    saved.projectionText === projection && saved.projectionHash === createHash("md5").update(projection).digest("hex") &&
    isDeepStrictEqual(saved.sourceProvenance, document.extraction_provenance ?? null);
}

/** Full-career readiness is separate from the cheaper matching attestation. */
export function candidateSourceProfileReady(document: SourceDocument): boolean {
  const parsed = document.parsed_result;
  return candidateSourceParseReady(document) && parsed?.matchingOnly === false &&
    parsed.profileExtractionVersion === CANDIDATE_SOURCE_PROFILE_VERSION &&
    !!parsed.profileGrounding && typeof parsed.profileGrounding === "object" && !Array.isArray(parsed.profileGrounding) &&
    Object.keys(SOURCE_PROFILE_PREFERENCE_COLUMNS).every(field =>
      Object.prototype.hasOwnProperty.call(parsed.profileGrounding, field)) &&
    parsed.isResume === true && Array.isArray(parsed.evidence) &&
    !!parsed.career && typeof parsed.career === "object" && !Array.isArray(parsed.career);
}

/** Durable attempts wait for their paired device without expiring into a paid replay. */
export function candidateSourceExtractionState(
  document: SourceDocument & { parse_status: string | null; parse_error: string | null },
  activeAttempt: boolean,
): { status: "unparsed" | "waiting_for_device" | "processing" | "ready" | "failed"; profileReady: boolean; errorCode: string | null } {
  const profileReady = candidateSourceProfileReady(document);
  if (profileReady) return { status: "ready", profileReady, errorCode: null };
  if (activeAttempt) return { status: document.parse_status === "processing" ? "processing" : "waiting_for_device", profileReady, errorCode: null };
  if (document.parse_status === "processing")
    return { status: "failed", profileReady, errorCode: "parse_interrupted" };
  if (document.parse_status === "failed")
    return { status: "failed", profileReady, errorCode: document.parse_error ?? "parse_unavailable" };
  return { status: "unparsed", profileReady, errorCode: null };
}

/** SQL expressions are internal identifiers/parameters, never candidate input. */
export function candidateSourceParseReadySql(document: string): string {
  return `COALESCE(${document}.parsed_result#>'{matchingContext,version}'='${CANDIDATE_SOURCE_MATCHING_VERSION}'::jsonb
    AND ${document}.parsed_result#>>'{matchingContext,contentHash}'=${document}.content_hash
    AND ${document}.parsed_result#>>'{matchingContext,sourceTextHash}'=md5(COALESCE(${document}.source_text,''))
    AND jsonb_typeof(${document}.parsed_result#>'{matchingContext,projectionText}')='string'
    AND ${document}.parsed_result#>>'{matchingContext,projectionHash}'=md5(${document}.parsed_result#>>'{matchingContext,projectionText}')
    AND ${document}.parsed_result#>'{matchingContext,sourceProvenance}'=COALESCE(${document}.extraction_provenance,'null'::jsonb),false)`;
}

function scopedPreferenceProjection(preferences: string, document: string, user: string): string {
  const conflicts = `${document}.parsed_result->'sourceVisibilityConflicts'`;
  const columns = [["residenceCountry", "residence_country"], ["workAuthorization", "work_authorization"],
    ["requiresSponsorship", "requires_sponsorship"], ...Object.entries(SOURCE_PROFILE_PREFERENCE_COLUMNS)]
    .map(([field, column]) => `('${field}','${column}')`).join(",");
  // Inspect only actual conflicts. Expanding a full predicate per preference
  // duplicates this source projection throughout eligibility and queue queries.
  return `(SELECT COALESCE(to_jsonb(${preferences}),'{}'::jsonb)
    || COALESCE(jsonb_object_agg(mask.column_name,NULL::jsonb),'{}'::jsonb)
    || jsonb_build_object('source_visibility_conflicts',COALESCE(jsonb_object_agg(mask.field,
      jsonb_build_object('status','unresolved','reason','A previous source-derived claim became hidden or unlocatable; the canonical value is preserved but not attributed to this CV. Explicitly confirm or edit it to use it.')),'{}'::jsonb))
    FROM (
      SELECT mapping.field,mapping.column_name
      FROM jsonb_each(CASE WHEN jsonb_typeof(${conflicts})='object' THEN ${conflicts} ELSE '{}'::jsonb END) conflict
      JOIN (VALUES ${columns}) mapping(field,column_name) ON mapping.field=conflict.key
      WHERE to_jsonb(${preferences})->mapping.column_name=conflict.value->'value'
        AND NOT COALESCE(${user}.properties->'explicitProfileFields' ? mapping.field,false)
        AND (mapping.field<>'residenceCountry' OR NOT COALESCE(${preferences}.screening_location_preferences ? 'currentLocation',false))
    ) mask)`;
}

/** A document-scoped view only; independent profile values are not attributed to this CV. */
export function candidateSourcePreferencesSql(preferences: string, owner: string, documentId: string): string {
  return `(SELECT ${scopedPreferenceProjection(preferences, "scope_document", "scope_user")}
    FROM graph_nodes scope_user LEFT JOIN candidate_documents scope_document
      ON scope_document.user_node_id=scope_user.id AND scope_document.id=${documentId}::uuid
    WHERE scope_user.id=${owner}::bigint)`;
}

/**
 * Effective per-source constraints used before model scoring and in assessment identity.
 * The owned, server-validated parse is the only CV fallback. Explicit location keys
 * (including intentional nulls) take precedence; citizenship is never a residence.
 * Callers must source_parse before queuing matching when sourceParseRequired is true.
 * An active worker must return that prerequisite, not recursively acquire its lease.
 */
export function candidateSourceLocationSql(owner: string, documentId: string): string {
  return `(SELECT jsonb_build_object(
    'currentLocation',effective.current_location,'location',effective.location,
    'residenceCountry',effective.residence_country,'relocation',effective.relocation,
    'destinations',CASE WHEN effective.relocation='specific_locations' THEN effective.destinations ELSE NULL END,
    'relocationLocations',CASE WHEN effective.relocation='specific_locations' THEN effective.relocation_locations ELSE '[]'::jsonb END,
    'workAuthorization',CASE WHEN u.properties->'explicitProfileFields' ? 'workAuthorization' THEN p.work_authorization
      ELSE COALESCE(p.work_authorization,parsed.value#>>'{preferences,workAuthorization}') END,
    'requiresSponsorship',CASE WHEN u.properties->'explicitProfileFields' ? 'requiresSponsorship' THEN to_jsonb(p.requires_sponsorship)
      ELSE COALESCE(to_jsonb(p.requires_sponsorship),NULLIF(parsed.value#>'{preferences,requiresSponsorship}','null'::jsonb)) END,
    'ianaTimezone',to_jsonb(p)->>'iana_timezone','utcOffset',p.utc_offset_minutes/60.0,
    'sourceParseRequired',NOT parsed.ready,
    'sourceVisibilityConflicts',scoped_preferences.value->'source_visibility_conflicts',
    'provenance',jsonb_build_object('documentId',d.id,'contentHash',d.content_hash,
      'sourceTextHash',md5(COALESCE(d.source_text,'')),'parseVersion',${CANDIDATE_SOURCE_MATCHING_VERSION},
      'mode',parsed.value#>>'{matchingContext,mode}','excerpts',parsed.value->'sourceGrounding',
      'currentLocation',CASE WHEN p.screening_location_preferences ? 'currentLocation' THEN 'explicit_preferences'
        WHEN effective.current_location IS NOT NULL THEN 'source_document' ELSE 'unknown' END,
      'residenceCountry',CASE WHEN p.screening_location_preferences ? 'currentLocation' OR p.residence_country IS NOT NULL THEN 'explicit_preferences'
        WHEN effective.residence_country IS NOT NULL THEN 'source_document' ELSE 'unknown' END,
      'relocation',CASE WHEN p.screening_location_preferences ? 'relocation' THEN 'explicit_preferences'
        WHEN effective.relocation IS NOT NULL THEN 'source_document' ELSE 'unknown' END,
      'workAuthorization',CASE WHEN u.properties->'explicitProfileFields' ? 'workAuthorization' OR p.work_authorization IS NOT NULL THEN 'explicit_preferences'
        WHEN parsed.value#>>'{preferences,workAuthorization}' IS NOT NULL THEN 'source_document' ELSE 'unknown' END,
      'requiresSponsorship',CASE WHEN u.properties->'explicitProfileFields' ? 'requiresSponsorship' OR p.requires_sponsorship IS NOT NULL THEN 'explicit_preferences'
        WHEN NULLIF(parsed.value#>'{preferences,requiresSponsorship}','null'::jsonb) IS NOT NULL THEN 'source_document' ELSE 'unknown' END))
    FROM candidate_documents d
    JOIN graph_nodes u ON u.id=d.user_node_id
    LEFT JOIN user_job_preferences stored_preferences ON stored_preferences.user_node_id=d.user_node_id
    CROSS JOIN LATERAL (SELECT ${scopedPreferenceProjection("stored_preferences", "d", "u")} AS value) scoped_preferences
    CROSS JOIN LATERAL jsonb_to_record(scoped_preferences.value) AS p(screening_location_preferences jsonb,
      residence_country text,work_authorization text,requires_sponsorship boolean,utc_offset_minutes integer,iana_timezone text)
    CROSS JOIN LATERAL (SELECT ${candidateSourceParseReadySql("d")} AS ready) validity
    CROSS JOIN LATERAL (SELECT validity.ready,CASE WHEN validity.ready THEN d.parsed_result ELSE NULL END AS value) parsed
    CROSS JOIN LATERAL (SELECT
      CASE WHEN u.properties->'explicitProfileFields' ? 'residenceCountry' AND p.residence_country IS NULL THEN NULL
        WHEN p.screening_location_preferences ? 'currentLocation' THEN p.screening_location_preferences->>'currentLocation'
        WHEN p.residence_country IS NOT NULL AND p.residence_country IS DISTINCT FROM parsed.value#>>'{location,countryCode}' THEN p.residence_country
        ELSE NULLIF(concat_ws(', ',parsed.value#>>'{location,city}',parsed.value#>>'{location,state}',
          COALESCE(parsed.value#>>'{location,country}',parsed.value#>>'{location,countryCode}',parsed.value#>>'{preferences,residenceCountry}')),'') END AS current_location,
      CASE WHEN (u.properties->'explicitProfileFields' ? 'residenceCountry' AND p.residence_country IS NULL)
        OR p.screening_location_preferences ? 'currentLocation'
        OR (p.residence_country IS NOT NULL AND p.residence_country IS DISTINCT FROM parsed.value#>>'{location,countryCode}') THEN NULL
        ELSE NULLIF(parsed.value->'location','null'::jsonb) END AS location,
      CASE WHEN (u.properties->'explicitProfileFields' ? 'residenceCountry' AND p.residence_country IS NULL)
        OR p.screening_location_preferences ? 'currentLocation' THEN NULL
        ELSE COALESCE(p.residence_country,parsed.value#>>'{location,countryCode}',parsed.value#>>'{preferences,residenceCountry}') END AS residence_country,
      CASE WHEN p.screening_location_preferences ? 'relocation' THEN p.screening_location_preferences->>'relocation'
        ELSE parsed.value#>>'{preferences,relocation}' END AS relocation,
      CASE WHEN p.screening_location_preferences ? 'destinations' THEN p.screening_location_preferences->>'destinations'
        ELSE (SELECT string_agg(value,'; ') FROM jsonb_array_elements_text(COALESCE(parsed.value#>'{preferences,relocationDestinations}','[]'::jsonb))) END AS destinations,
      CASE WHEN p.screening_location_preferences ? 'destinations' THEN
        CASE WHEN NULLIF(btrim(p.screening_location_preferences->>'destinations'),'') IS NULL THEN '[]'::jsonb
          ELSE jsonb_build_array(p.screening_location_preferences->>'destinations') END
        ELSE COALESCE(parsed.value#>'{preferences,relocationDestinations}','[]'::jsonb) END AS relocation_locations
    ) effective
    WHERE d.user_node_id=${owner}::bigint AND d.id=${documentId}::uuid)`;
}
