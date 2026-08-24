import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import {
  JobListResult,
  WorkArrangementClassification,
  WorkLocationOption,
} from "src/shared/interfaces";
import { PostgresService } from "./postgres.service";
import {
  jobEmployerJoins,
  jobEmployerPayload,
} from "./sql/job-employer-payload.sql";

type QueryExecutor = PostgresService | EntityManager;

type NodeRecord = {
  nodeId: string;
  properties: Record<string, unknown>;
};

const normalizedHost = (value: string): string | null => {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/\.$/, "");
  } catch {
    return null;
  }
};

const hostsShareDomainBoundary = (left: string, right: string): boolean => {
  const leftHost = normalizedHost(left);
  const rightHost = normalizedHost(right);
  if (!leftHost || !rightHost) return false;
  return (
    leftHost === rightHost ||
    leftHost.endsWith(`.${rightHost}`) ||
    rightHost.endsWith(`.${leftHost}`)
  );
};

const queryRows = async <T>(
  executor: QueryExecutor,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> => {
  const result = await (
    executor as unknown as {
      query: (query: string, parameters?: unknown[]) => Promise<unknown>;
    }
  ).query(sql, parameters);
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === "number"
  ) {
    return result[0] as T[];
  }
  return result as T[];
};

@Injectable()
export class ProfileRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getEntityProfilesForAdminGrid(options: {
    limit: number;
    offset: number;
    query?: string;
    childId?: string;
    childType?: "Organization" | "Project";
  }): Promise<{ data: Record<string, unknown>[]; total: number }> {
    const rows = await queryRows<{
      profile: Record<string, unknown>;
      totalCount: string | number;
    }>(
      this.postgres,
      `
        WITH matching_profiles AS MATERIALIZED (
          SELECT
            profile.id AS profile_node_id,
            profile.properties AS profile_properties,
            info.id AS profile_info_node_id,
            info.properties AS profile_info_properties
          FROM graph_nodes profile
          JOIN graph_relationships profile_info
            ON profile_info.source_id = profile.id
           AND profile_info.type = 'HAS_PROFILE_INFO'
          JOIN graph_nodes info
            ON info.id = profile_info.target_id
           AND info.label = 'ProfileInfo'
          WHERE profile.label = 'EntityProfile'
            AND NOT entity_property_is_banned(profile.properties)
            AND (
              $3::text IS NULL
              OR lower(COALESCE(profile.properties ->> 'slug', ''))
                   LIKE '%' || lower($3) || '%'
              OR lower(COALESCE(info.properties ->> 'displayName', ''))
                   LIKE '%' || lower($3) || '%'
              OR lower(COALESCE(info.properties ->> 'name', ''))
                   LIKE '%' || lower($3) || '%'
              OR EXISTS (
                SELECT 1
                FROM graph_relationships membership
                JOIN graph_nodes child ON child.id = membership.target_id
                WHERE membership.source_id = profile.id
                  AND membership.type IN (
                    'PROFILE_HAS_ORGANIZATION', 'PROFILE_HAS_PROJECT'
                  )
                  AND child.label IN ('Organization', 'Project')
                  AND (
                    lower(COALESCE(child.properties ->> 'name', ''))
                      LIKE '%' || lower($3) || '%'
                    OR lower(COALESCE(
                      child.properties ->> 'orgId',
                      child.properties ->> 'id',
                      ''
                    )) LIKE '%' || lower($3) || '%'
                  )
              )
            )
            AND (
              $4::text IS NULL
              OR EXISTS (
                SELECT 1
                FROM graph_relationships exact_membership
                JOIN graph_nodes exact_child
                  ON exact_child.id = exact_membership.target_id
                WHERE exact_membership.source_id = profile.id
                  AND exact_membership.type IN (
                    'PROFILE_HAS_ORGANIZATION', 'PROFILE_HAS_PROJECT'
                  )
                  AND exact_child.label IN ('Organization', 'Project')
                  AND COALESCE(
                    exact_child.properties ->> 'orgId',
                    exact_child.properties ->> 'id'
                  ) = $4
                  AND ($5::text IS NULL OR exact_child.label = $5)
              )
            )
        ), paged_profiles AS MATERIALIZED (
          SELECT matching_profiles.*, count(*) OVER () AS total_count
          FROM matching_profiles
          ORDER BY
            lower(COALESCE(
              profile_info_properties ->> 'displayName',
              profile_info_properties ->> 'name',
              profile_properties ->> 'slug',
              ''
            )),
            profile_node_id
          LIMIT $1 OFFSET $2
        )
        SELECT
          jsonb_build_object(
            'id', COALESCE(
              page.profile_properties ->> 'id',
              page.profile_node_id::text
            ),
            'nodeId', page.profile_node_id::text,
            'slug', page.profile_properties ->> 'slug',
            'canonicalSlug', page.profile_properties ->> 'slug',
            'category', page.profile_properties ->> 'category',
            'aliases', COALESCE(
              page.profile_properties -> 'aliases',
              '[]'::jsonb
            ),
            'createdTimestamp', page.profile_properties -> 'createdTimestamp',
            'updatedTimestamp', page.profile_properties -> 'updatedTimestamp',
            'info', jsonb_strip_nulls(jsonb_build_object(
              'id', COALESCE(
                page.profile_info_properties ->> 'id',
                page.profile_info_node_id::text
              ),
              'nodeId', page.profile_info_node_id::text,
              'displayName', COALESCE(
                page.profile_info_properties ->> 'displayName',
                page.profile_info_properties ->> 'name'
              ),
              'summary',
                page.profile_info_properties ->> 'summary',
              'description',
                page.profile_info_properties ->> 'description',
              'logo', COALESCE(
                page.profile_info_properties ->> 'logo',
                page.profile_info_properties ->> 'icon'
              ),
              'canonicalSite',
                page.profile_info_properties ->> 'canonicalSite',
              'tagline', COALESCE(
                page.profile_info_properties ->> 'tagline',
                page.profile_info_properties ->> 'tagLine'
              ),
              'foundingDate',
                page.profile_info_properties ->> 'foundingDate',
              'profileType', page.profile_info_properties -> 'profileType',
              'profileSector', page.profile_info_properties -> 'profileSector',
              'profileStatus', page.profile_info_properties -> 'profileStatus',
              'createdTimestamp',
                page.profile_info_properties -> 'createdTimestamp',
              'updatedTimestamp',
                page.profile_info_properties -> 'updatedTimestamp'
            )),
            'organizations', COALESCE(
              children.organizations,
              '[]'::jsonb
            ),
            'projects', COALESCE(children.projects, '[]'::jsonb)
          ) AS profile,
          page.total_count AS "totalCount"
        FROM paged_profiles page
        LEFT JOIN LATERAL (
          SELECT
            jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id', child.properties ->> 'orgId',
              'nodeId', child.id::text,
              'name', child.properties ->> 'name',
              'slug', COALESCE(
                child.properties ->> 'slug',
                child.properties ->> 'normalizedName'
              ),
              'logo', COALESCE(
                child.properties ->> 'logoUrl',
                child.properties ->> 'logo'
              ),
              'summary', COALESCE(
                child.properties ->> 'summary',
                child.properties ->> 'description'
              )
            )) ORDER BY child.properties ->> 'name', child.id)
              FILTER (WHERE child.label = 'Organization') AS organizations,
            jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id', child.properties ->> 'id',
              'nodeId', child.id::text,
              'name', child.properties ->> 'name',
              'slug', COALESCE(
                child.properties ->> 'slug',
                child.properties ->> 'normalizedName'
              ),
              'logo', COALESCE(
                child.properties ->> 'logoUrl',
                child.properties ->> 'logo'
              ),
              'summary', COALESCE(
                child.properties ->> 'summary',
                child.properties ->> 'description'
              )
            )) ORDER BY child.properties ->> 'name', child.id)
              FILTER (WHERE child.label = 'Project') AS projects
          FROM graph_relationships membership
          JOIN graph_nodes child ON child.id = membership.target_id
          WHERE membership.source_id = page.profile_node_id
            AND membership.type IN (
              'PROFILE_HAS_ORGANIZATION', 'PROFILE_HAS_PROJECT'
            )
            AND child.label IN ('Organization', 'Project')
            AND NOT entity_property_is_banned(child.properties)
        ) children ON true
      `,
      [
        options.limit,
        options.offset,
        options.query?.trim() || null,
        options.childId?.trim() || null,
        options.childType ?? null,
      ],
    );

    return {
      data: rows.map(row => row.profile),
      total: Number(rows[0]?.totalCount ?? 0),
    };
  }

  async getJobPreferences(
    wallet: string,
  ): Promise<Record<string, unknown> | null> {
    const [row] = await queryRows<Record<string, unknown>>(
      this.postgres,
      `
        SELECT jsonb_build_object(
          'workModes', COALESCE(
            preferences.work_modes,
            ARRAY['remote', 'hybrid', 'onsite']::text[]
          ),
          'residenceCountry', preferences.residence_country,
          'utcOffset', preferences.utc_offset_minutes / 60.0,
          'workAuthorization', preferences.work_authorization,
          'requiresSponsorship', preferences.requires_sponsorship,
          'attendancePreference', preferences.attendance_preference,
          'travelTolerance', preferences.travel_tolerance
        ) AS preferences
        FROM graph_nodes account
        LEFT JOIN user_job_preferences preferences
          ON preferences.user_node_id = account.id
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
        ORDER BY account.id
        LIMIT 1
      `,
      [wallet],
    );
    return (row?.preferences as Record<string, unknown> | undefined) ?? null;
  }

  async updateJobPreferences(
    wallet: string,
    preferences: {
      workModes: string[];
      residenceCountry: string | null;
      utcOffset: number | null;
      workAuthorization: string | null;
      requiresSponsorship: boolean | null;
      attendancePreference: string | null;
      travelTolerance: string | null;
    },
  ): Promise<boolean> {
    const rows = await queryRows<{ userNodeId: string }>(
      this.postgres,
      `
        INSERT INTO user_job_preferences (
          user_node_id, work_modes, residence_country, utc_offset_minutes,
          work_authorization, requires_sponsorship, attendance_preference,
          travel_tolerance, updated_at
        )
        SELECT
          account.id, $2::text[], $3, $4::integer, $5, $6::boolean, $7,
          $8, now()
        FROM graph_nodes account
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
        ORDER BY account.id
        LIMIT 1
        ON CONFLICT (user_node_id) DO UPDATE SET
          work_modes = EXCLUDED.work_modes,
          residence_country = EXCLUDED.residence_country,
          utc_offset_minutes = EXCLUDED.utc_offset_minutes,
          work_authorization = EXCLUDED.work_authorization,
          requires_sponsorship = EXCLUDED.requires_sponsorship,
          attendance_preference = EXCLUDED.attendance_preference,
          travel_tolerance = EXCLUDED.travel_tolerance,
          updated_at = now()
        RETURNING user_node_id::text AS "userNodeId"
      `,
      [
        wallet,
        preferences.workModes,
        preferences.residenceCountry,
        preferences.utcOffset === null
          ? null
          : Math.round(preferences.utcOffset * 60),
        preferences.workAuthorization,
        preferences.requiresSponsorship,
        preferences.attendancePreference,
        preferences.travelTolerance,
      ],
    );
    return rows.length === 1;
  }

  async getJobMatchingCandidates(limit = 100): Promise<
    Array<{
      job: JobListResult;
      options: WorkLocationOption[];
      arrangementClassification: WorkArrangementClassification;
    }>
  > {
    return queryRows<{
      job: JobListResult;
      options: WorkLocationOption[];
      arrangementClassification: WorkArrangementClassification;
    }>(
      this.postgres,
      `
        WITH latest_extractions AS MATERIALIZED (
          SELECT DISTINCT ON (raw_job_node_id, jobsite_node_id)
            raw_job_node_id, jobsite_node_id, extractor_version
          FROM job_availability_extractions
          ORDER BY
            raw_job_node_id, jobsite_node_id,
            extracted_at DESC, extractor_version DESC
        ), selected_options AS MATERIALIZED (
          SELECT option.*, structured_edge.target_id AS structured_job_node_id
          FROM latest_extractions extraction
          JOIN job_work_location_options option USING (
            raw_job_node_id, jobsite_node_id, extractor_version
          )
          JOIN graph_relationships structured_edge
            ON structured_edge.source_id = option.raw_job_node_id
           AND structured_edge.type = 'HAS_STRUCTURED_JOBPOST'
          WHERE option.mode IN ('remote', 'hybrid', 'onsite')
        )
        SELECT
          ${jobEmployerPayload("document.payload", "document")} AS job,
          COALESCE(
            document.work_arrangement ->> 'classification', 'unstated'
          ) AS "arrangementClassification",
          COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'classification', COALESCE(
              document.work_arrangement ->> 'classification', 'unstated'
            ),
            'mode', option.mode,
            'scope', CASE option.scope
              WHEN 'region_list' THEN 'region'
              ELSE option.scope
            END,
            'includedCountries', ARRAY(
              SELECT upper(country)
              FROM unnest(option.countries) country
              WHERE country ~* '^[A-Z]{2}$'
            ),
            'excludedCountries', COALESCE(
              ARRAY(
                SELECT upper(country)
                FROM unnest(option.excluded_countries) country
                WHERE country ~* '^[A-Z]{2}$'
              ), ARRAY[]::text[]
            ),
            'includedRegions', ARRAY(
              SELECT region
              FROM unnest(option.regions) region
              WHERE region = ANY(ARRAY[
                'EU', 'Europe', 'EMEA', 'AMER', 'LATAM', 'APAC'
              ]::text[])
            ),
            'excludedRegions', COALESCE(
              ARRAY(
                SELECT region
                FROM unnest(option.excluded_regions) region
                WHERE region = ANY(ARRAY[
                  'EU', 'Europe', 'EMEA', 'AMER', 'LATAM', 'APAC'
                ]::text[])
              ), ARRAY[]::text[]
            ),
            'requiredUtcBand', CASE
              WHEN option.required_minimum_utc_offset_minutes IS NOT NULL
                AND option.required_maximum_utc_offset_minutes IS NOT NULL
              THEN jsonb_build_object(
                'minimumUtcOffset',
                  option.required_minimum_utc_offset_minutes / 60.0,
                'maximumUtcOffset',
                  option.required_maximum_utc_offset_minutes / 60.0
              )
              ELSE NULL
            END,
            'preferredUtcBand', CASE
              WHEN option.preferred_minimum_utc_offset_minutes IS NOT NULL
                AND option.preferred_maximum_utc_offset_minutes IS NOT NULL
              THEN jsonb_build_object(
                'minimumUtcOffset',
                  option.preferred_minimum_utc_offset_minutes / 60.0,
                'maximumUtcOffset',
                  option.preferred_maximum_utc_offset_minutes / 60.0
              )
              ELSE NULL
            END,
            'residencyRequirements', to_jsonb(option.residency_requirements),
            'workAuthorizationRequirements',
              to_jsonb(option.work_authorizations),
            'sponsorshipStatus', option.sponsorship_status,
            'officeCity', NULLIF(btrim(option.office_city), ''),
            'attendanceCadence', option.attendance_cadence,
            'travelRequirement', option.travel_requirement,
            'evidence', CASE
              WHEN NULLIF(btrim(option.evidence_quote), '') IS NOT NULL
                AND option.evidence_start_offset >= 0
                AND option.evidence_end_offset > option.evidence_start_offset
                AND option.evidence_end_offset - option.evidence_start_offset
                  = length(option.evidence_quote)
                AND option.evidence_trust IN (
                  'employer_body', 'employer_ats_field',
                  'verified_employer_policy', 'aggregator'
                )
              THEN jsonb_build_array(jsonb_build_object(
                'quote', option.evidence_quote,
                'startOffset', option.evidence_start_offset,
                'endOffset', option.evidence_end_offset,
                'source', option.evidence_trust,
                'trust', option.evidence_trust,
                'provenance', option.evidence_provenance::text
              ))
              ELSE '[]'::jsonb
            END,
            'confidence', option.arrangement_confidence
          )) ORDER BY option.option_key)
            FILTER (WHERE option.option_key IS NOT NULL), '[]'::jsonb) AS options
        FROM job_search_documents document
        LEFT JOIN selected_options option
          ON option.structured_job_node_id = document.job_node_id
        ${jobEmployerJoins("document")}
        WHERE document.online
          AND NOT document.blocked
          AND num_nonnulls(
            document.organization_id,
            document.project_id
          ) = 1
          AND (organization.payload IS NOT NULL OR project.payload IS NOT NULL)
        GROUP BY
          document.job_node_id,
          document.payload,
          document.published_timestamp,
          organization.payload,
          project.payload,
          document.work_arrangement
        ORDER BY document.published_timestamp DESC NULLS LAST, document.job_node_id
        LIMIT $1
      `,
      [Math.max(1, Math.min(limit, 500))],
    );
  }

  async getPublicEntityProfile(
    slug: string,
  ): Promise<Record<string, unknown> | null> {
    const [row] = await queryRows<Record<string, unknown>>(
      this.postgres,
      `
        SELECT jsonb_build_object(
          'id', profile.properties ->> 'id',
          'slug', profile.properties ->> 'slug',
          'canonicalSlug', profile.properties ->> 'slug',
          'category', profile.properties ->> 'category',
          'info', jsonb_strip_nulls(jsonb_build_object(
            'displayName', COALESCE(
              info.properties ->> 'displayName',
              info.properties ->> 'name'
            ),
            'summary', info.properties ->> 'summary',
            'description', info.properties ->> 'description',
            'logo', COALESCE(
              info.properties ->> 'logo',
              info.properties ->> 'icon'
            ),
            'canonicalSite', info.properties ->> 'canonicalSite',
            'tagline', COALESCE(
              info.properties ->> 'tagline',
              info.properties ->> 'tagLine'
            ),
            'foundingDate', info.properties ->> 'foundingDate',
            'profileType', info.properties -> 'profileType',
            'profileSector', info.properties -> 'profileSector',
            'profileStatus', info.properties -> 'profileStatus'
          )),
          'children', COALESCE((
            SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id', COALESCE(
                child.properties ->> 'orgId',
                child.properties ->> 'id'
              ),
              'type', lower(child.label),
              'name', child.properties ->> 'name',
              'slug', COALESCE(
                child.properties ->> 'slug',
                child.properties ->> 'normalizedName'
              ),
              'logo', COALESCE(
                child.properties ->> 'logoUrl',
                child.properties ->> 'logo'
              ),
              'summary', COALESCE(
                child.properties ->> 'summary',
                child.properties ->> 'description'
              )
            )) ORDER BY child.label, child.properties ->> 'name', child.id)
            FROM graph_relationships membership
            JOIN graph_nodes child ON child.id = membership.target_id
            WHERE membership.source_id = profile.id
              AND membership.type IN (
                'PROFILE_HAS_ORGANIZATION', 'PROFILE_HAS_PROJECT'
              )
              AND child.label IN ('Organization', 'Project')
              AND NOT entity_property_is_banned(child.properties)
          ), '[]'::jsonb),
          'reviews', COALESCE((
            SELECT jsonb_build_object(
              'count', count(*)::integer,
              'averageRating', round(avg(review.rating)::numeric, 2)
            )
            FROM profile_reviews review
            WHERE review.profile_node_id = profile.id
              AND review.status IN ('published', 'redacted')
          ), jsonb_build_object('count', 0, 'averageRating', NULL)),
          'salaries', (
            WITH salary_rows AS MATERIALIZED (
              SELECT review.salary, review.currency
              FROM profile_reviews review
              WHERE review.profile_node_id = profile.id
                -- Compensation aggregates are independent of whether review
                -- prose has completed moderation. Pending exact-owner salary
                -- rows are eligible; rejected rows never are.
                AND review.status IN ('pending', 'published', 'redacted')
                AND review.salary IS NOT NULL
                AND review.salary > 0
                AND review.currency ~ '^[A-Z]{3}$'
                AND (
                  review.child_node_id IS NULL OR EXISTS (
                    SELECT 1
                    FROM graph_relationships exact_membership
                    WHERE exact_membership.source_id = profile.id
                      AND exact_membership.target_id = review.child_node_id
                      AND exact_membership.type IN (
                        'PROFILE_HAS_ORGANIZATION', 'PROFILE_HAS_PROJECT'
                      )
                  )
                )
              UNION ALL
              -- Transitional exact-ownership fallback. Migration 98 accounts
              -- every safe legacy row, so only as-yet unmigrated, non-
              -- quarantined rows can enter this arm.
              SELECT jsonb_numeric_value(legacy.properties, 'salary'),
                upper(legacy.properties ->> 'currency')
              FROM graph_relationships membership
              JOIN graph_relationships child_review
                ON child_review.source_id = membership.target_id
               AND child_review.type = 'HAS_REVIEW'
              JOIN graph_nodes legacy
                ON legacy.id = child_review.target_id
               AND legacy.label = 'OrgReview'
              WHERE membership.source_id = profile.id
                AND membership.type IN (
                  'PROFILE_HAS_ORGANIZATION', 'PROFILE_HAS_PROJECT'
                )
                AND jsonb_numeric_value(legacy.properties, 'salary') IS NOT NULL
                AND jsonb_numeric_value(legacy.properties, 'salary') > 0
                AND upper(legacy.properties ->> 'currency') ~ '^[A-Z]{3}$'
                AND NOT EXISTS (
                  SELECT 1 FROM profile_reviews migrated
                  WHERE migrated.legacy_review_node_id = legacy.id
                )
                AND NOT EXISTS (
                  SELECT 1 FROM legacy_org_review_quarantine quarantined
                  WHERE quarantined.legacy_review_node_id = legacy.id
                )
            ), grouped AS (
              SELECT currency, count(*)::integer AS review_count,
                round(avg(salary)::numeric, 2) AS average_salary,
                min(salary) AS minimum_salary,
                max(salary) AS maximum_salary
              FROM salary_rows
              GROUP BY currency
            )
            SELECT jsonb_build_object(
              'count', (SELECT count(*)::integer FROM salary_rows),
              'byCurrency', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'currency', salary.currency,
                  'count', salary.review_count,
                  'average', salary.average_salary,
                  'minimum', salary.minimum_salary,
                  'maximum', salary.maximum_salary
                ) ORDER BY salary.currency)
                FROM grouped salary
              ), '[]'::jsonb)
            )
          ),
          'notices', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', notice.id::text,
              'text', notice.redacted_public_text,
              'decidedAt', notice.decided_at
            ) ORDER BY notice.decided_at DESC, notice.id)
            FROM profile_notices notice
            WHERE notice.profile_node_id = profile.id
              AND notice.status = 'decided'
              AND NULLIF(btrim(notice.redacted_public_text), '') IS NOT NULL
          ), '[]'::jsonb)
        ) AS profile
        FROM graph_nodes profile
        JOIN graph_relationships profile_info
          ON profile_info.source_id = profile.id
         AND profile_info.type = 'HAS_PROFILE_INFO'
        JOIN graph_nodes info
          ON info.id = profile_info.target_id AND info.label = 'ProfileInfo'
        WHERE profile.label = 'EntityProfile'
          AND (
            profile.properties ->> 'slug' = $1
            OR COALESCE(profile.properties -> 'aliases', '[]'::jsonb) ? $1
          )
          AND NOT COALESCE(jsonb_boolean_value(profile.properties, 'banned'), false)
        LIMIT 1
      `,
      [slug],
    );
    return (row?.profile as Record<string, unknown> | undefined) ?? null;
  }

  async createProfileReview(
    authorUserId: string,
    profileSlug: string,
    input: {
      childId?: string | null;
      rating: number;
      reviewText: string;
      salary?: number | null;
      currency?: string | null;
      offersTokenAllocation?: boolean | null;
    },
  ): Promise<Record<string, unknown> | null> {
    const [row] = await queryRows<{ value: Record<string, unknown> }>(
      this.postgres,
      `
        WITH target_profile AS MATERIALIZED (
          SELECT profile.id
          FROM graph_nodes profile
          WHERE profile.label = 'EntityProfile'
            AND profile.properties ->> 'slug' = $2
            AND NOT entity_property_is_banned(profile.properties)
          ORDER BY profile.id
          LIMIT 1
        ), target_child AS MATERIALIZED (
          SELECT child.id
          FROM target_profile profile
          JOIN graph_relationships membership
            ON membership.source_id = profile.id
           AND membership.type IN (
             'PROFILE_HAS_ORGANIZATION', 'PROFILE_HAS_PROJECT'
           )
          JOIN graph_nodes child
            ON child.id = membership.target_id
           AND child.label IN ('Organization', 'Project')
          WHERE $3::text IS NOT NULL
            AND COALESCE(
              child.properties ->> 'orgId',
              child.properties ->> 'id'
            ) = $3
            AND NOT entity_property_is_banned(child.properties)
          ORDER BY child.id
          LIMIT 1
        ), inserted AS (
          INSERT INTO profile_reviews (
            profile_node_id, child_node_id, author_user_id, rating,
            review_text, salary, currency, offers_token_allocation,
            status, ownership_fingerprint
          )
          SELECT profile.id, child.id, $1, $4::integer, btrim($5),
            $6::numeric,
            CASE WHEN $6::numeric IS NULL THEN NULL ELSE upper($7) END,
            $8::boolean, 'pending', encode(digest(concat_ws(':',
              profile.id::text, COALESCE(child.id::text, ''), lower($1),
              clock_timestamp()::text
            ), 'sha256'), 'hex')
          FROM target_profile profile
          LEFT JOIN target_child child ON true
          WHERE $3::text IS NULL OR child.id IS NOT NULL
          ON CONFLICT (profile_node_id, child_node_id, author_user_id)
            WHERE legacy_review_node_id IS NULL
          DO UPDATE SET
            rating = EXCLUDED.rating,
            review_text = EXCLUDED.review_text,
            salary = EXCLUDED.salary,
            currency = EXCLUDED.currency,
            offers_token_allocation = EXCLUDED.offers_token_allocation,
            status = 'pending',
            redacted_public_text = NULL,
            decided_at = NULL,
            decided_by = NULL
          RETURNING id, status, created_at
        )
        SELECT jsonb_build_object(
          'id', id::text,
          'status', status,
          'createdAt', created_at
        ) AS value
        FROM inserted
      `,
      [
        authorUserId,
        profileSlug,
        input.childId ?? null,
        input.rating,
        input.reviewText,
        input.salary ?? null,
        input.currency?.trim().toUpperCase() ?? null,
        input.offersTokenAllocation ?? null,
      ],
    );
    return row?.value ?? null;
  }

  async createRecruiterCase(
    reporterUserId: string,
    profileSlug: string,
    input: {
      childId?: string | null;
      allegation: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown> | null> {
    const [row] = await queryRows<{ value: Record<string, unknown> }>(
      this.postgres,
      `
        WITH target_profile AS MATERIALIZED (
          SELECT profile.id
          FROM graph_nodes profile
          WHERE profile.label = 'EntityProfile'
            AND profile.properties ->> 'slug' = $2
            AND NOT entity_property_is_banned(profile.properties)
          ORDER BY profile.id
          LIMIT 1
        ), target_child AS MATERIALIZED (
          SELECT child.id
          FROM target_profile profile
          JOIN graph_relationships membership
            ON membership.source_id = profile.id
           AND membership.type IN (
             'PROFILE_HAS_ORGANIZATION', 'PROFILE_HAS_PROJECT'
           )
          JOIN graph_nodes child
            ON child.id = membership.target_id
           AND child.label IN ('Organization', 'Project')
          WHERE $3::text IS NOT NULL
            AND COALESCE(
              child.properties ->> 'orgId',
              child.properties ->> 'id'
            ) = $3
            AND NOT entity_property_is_banned(child.properties)
          ORDER BY child.id
          LIMIT 1
        ), inserted AS (
          INSERT INTO recruiter_cases (
            profile_node_id, child_node_id, reporter_user_id,
            status, allegation
          )
          SELECT profile.id, child.id, $1, 'pending', $4::jsonb
          FROM target_profile profile
          LEFT JOIN target_child child ON true
          WHERE $3::text IS NULL OR child.id IS NOT NULL
          RETURNING id, status, created_at
        )
        SELECT jsonb_build_object(
          'id', id::text,
          'status', status,
          'createdAt', created_at
        ) AS value
        FROM inserted
      `,
      [
        reporterUserId,
        profileSlug,
        input.childId ?? null,
        JSON.stringify(input.allegation),
      ],
    );
    return row?.value ?? null;
  }

  async getUserRepos(wallet: string): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ repo: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT jsonb_build_object(
          'id', repository.properties -> 'id',
          'name', repository.properties -> 'nameWithOwner',
          'description', repository.properties -> 'description',
          'timestamp', COALESCE(
            jsonb_numeric_value(repository.properties, 'updatedTimestamp'),
            jsonb_numeric_value(repository.properties, 'updatedAt')
          ),
          'org', COALESCE((
            SELECT jsonb_build_object(
              'name', organization.properties ->> 'name',
              'url', COALESCE((
                SELECT website.properties ->> 'url'
                FROM graph_relationships website_relationship
                JOIN graph_nodes website
                  ON website.id = website_relationship.target_id
                WHERE website_relationship.source_id = organization.id
                  AND website_relationship.type = 'HAS_WEBSITE'
                LIMIT 1
              ), ''),
              'logo', COALESCE(
                organization.properties -> 'logo',
                organization.properties -> 'logoUrl'
              )
            )
            FROM graph_relationships github_repository
            JOIN graph_nodes github_organization
              ON github_organization.id = github_repository.source_id
             AND github_organization.label = 'GithubOrganization'
            JOIN graph_relationships organization_github
              ON organization_github.target_id = github_organization.id
             AND organization_github.type = 'HAS_GITHUB'
            JOIN graph_nodes organization
              ON organization.id = organization_github.source_id
             AND organization.label = 'Organization'
            WHERE github_repository.target_id = repository.id
              AND github_repository.type = 'HAS_REPOSITORY'
            LIMIT 1
          ), jsonb_build_object('name', '', 'url', '', 'logo', NULL)),
          'tags', COALESCE((
            SELECT jsonb_agg(DISTINCT tag.properties || jsonb_build_object(
              'canTeach', COALESCE(
                jsonb_boolean_value(skill.properties, 'canTeach'), false
              )
            ))
            FROM graph_relationships used_tag
            JOIN graph_nodes tag
              ON tag.id = used_tag.target_id AND tag.label = 'Tag'
            JOIN graph_relationships used_on
              ON used_on.source_id = tag.id
             AND used_on.target_id = repository.id
             AND used_on.type = 'USED_ON'
            JOIN graph_relationships skill
              ON skill.source_id = account.id
             AND skill.target_id = tag.id
             AND skill.type = 'HAS_SKILL'
            WHERE used_tag.source_id = github.id
              AND used_tag.type = 'USED_TAG'
          ), '[]'::jsonb),
          'contribution', contribution.properties -> 'summary'
        ) AS repo
        FROM graph_nodes account
        JOIN graph_relationships account_github
          ON account_github.source_id = account.id
         AND account_github.type = 'HAS_GITHUB_USER'
        JOIN graph_nodes github
          ON github.id = account_github.target_id AND github.label = 'GithubUser'
        JOIN graph_relationships contribution
          ON contribution.source_id = github.id
         AND contribution.type = 'CONTRIBUTED_TO'
        JOIN graph_nodes repository
          ON repository.id = contribution.target_id
         AND repository.label = 'GithubRepository'
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
        ORDER BY COALESCE(
          jsonb_numeric_value(repository.properties, 'updatedTimestamp'), 0
        ) DESC, repository.id
      `,
      [wallet],
    );
    return rows.map(row => row.repo);
  }

  async getReviewedOrganizations(
    wallet: string,
  ): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ value: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT jsonb_build_object(
          'compensation', jsonb_build_object(
            'salary', review.salary,
            'currency', review.currency,
            'offersTokenAllocation', COALESCE(
              review.offers_token_allocation, false
            )
          ),
          'rating', jsonb_build_object(
            'onboarding', review.legacy_payload -> 'onboarding',
            'careerGrowth', review.legacy_payload -> 'careerGrowth',
            'benefits', review.legacy_payload -> 'benefits',
            'workLifeBalance', review.legacy_payload -> 'workLifeBalance',
            'diversityInclusion', review.legacy_payload -> 'diversityInclusion',
            'management', review.legacy_payload -> 'management',
            'product', review.legacy_payload -> 'product',
            'compensation', review.legacy_payload -> 'compensation'
          ),
          'review', jsonb_build_object(
            'id', review.id::text,
            'title', review.legacy_payload -> 'title',
            'location', review.legacy_payload -> 'location',
            'timezone', review.legacy_payload -> 'timezone',
            'pros', review.legacy_payload -> 'pros',
            'cons', review.legacy_payload -> 'cons'
          ),
          'reviewedTimestamp', COALESCE(
            jsonb_numeric_value(review.legacy_payload, 'reviewedTimestamp'),
            floor(extract(epoch FROM review.created_at) * 1000)::bigint
          ),
          'org', organization.properties || jsonb_build_object(
            'docs', graph_first_related_text(organization.id, 'HAS_DOCSITE', 'url'),
            'github', graph_first_related_text(organization.id, 'HAS_GITHUB', 'login'),
            'website', graph_first_related_text(organization.id, 'HAS_WEBSITE', 'url'),
            'discord', graph_first_related_text(organization.id, 'HAS_DISCORD', 'invite'),
            'telegram', graph_first_related_text(organization.id, 'HAS_TELEGRAM', 'username'),
            'twitter', graph_first_related_text(organization.id, 'HAS_TWITTER', 'username')
          )
        ) AS value
        FROM profile_reviews review
        JOIN graph_nodes organization
          ON organization.id = review.child_node_id
         AND organization.label = 'Organization'
        JOIN graph_relationships membership
          ON membership.source_id = review.profile_node_id
         AND membership.target_id = organization.id
         AND membership.type = 'PROFILE_HAS_ORGANIZATION'
        WHERE lower(review.author_user_id) = lower($1)
          AND review.status <> 'removed'
        ORDER BY review.id
      `,
      [wallet],
    );
    return rows.map(row => row.value);
  }

  async findVerificationOrganizationsByNames(
    wallet: string,
    names: string[],
  ): Promise<Record<string, unknown>[]> {
    if (!names.length) return [];
    return this.getVerificationOrganizations(
      wallet,
      `organization.properties ->> 'name' = ANY($2::text[])`,
      [names],
    );
  }

  async findVerificationOrganizationsByEmails(
    wallet: string,
    emails: string[],
  ): Promise<Record<string, unknown>[]> {
    const domains = [
      ...new Set(
        emails.map(email => email.split("@")[1]?.toLowerCase()).filter(Boolean),
      ),
    ];
    if (!domains.length) return [];
    const organizations = await this.getVerificationOrganizations(
      wallet,
      `EXISTS (
        SELECT 1
        FROM graph_relationships website_relationship
        JOIN graph_nodes website ON website.id = website_relationship.target_id
        CROSS JOIN unnest($2::text[]) AS requested_domain(domain)
        WHERE website_relationship.source_id = organization.id
          AND website_relationship.type = 'HAS_WEBSITE'
          AND (
            normalized_url_host(website.properties ->> 'url') =
              normalized_url_host(requested_domain.domain)
            OR right(
              normalized_url_host(website.properties ->> 'url'),
              char_length(normalized_url_host(requested_domain.domain)) + 1
            ) = '.' || normalized_url_host(requested_domain.domain)
            OR right(
              normalized_url_host(requested_domain.domain),
              char_length(normalized_url_host(website.properties ->> 'url')) + 1
            ) = '.' || normalized_url_host(website.properties ->> 'url')
          )
      )`,
      [domains],
    );
    return organizations.map(organization => {
      const url = String(organization.url ?? "");
      let hostname = url.toLowerCase();
      try {
        hostname = new URL(url).hostname.toLowerCase();
      } catch {
        // Keep the raw value for parity with permissive historical URL data.
      }
      const account = emails.find(email => {
        const domain = email.split("@")[1]?.toLowerCase();
        return domain ? hostsShareDomainBoundary(hostname, domain) : false;
      });
      return { ...organization, account: account ?? "" };
    });
  }

  async findOrganizationIdsByEmails(emails: string[]): Promise<string[]> {
    const organizations = await this.findVerificationOrganizationsByEmails(
      "",
      emails,
    );
    return organizations.map(value => String(value.id));
  }

  async replaceVerifications(
    wallet: string,
    organizations: {
      id: string;
      credential: string;
      account: string;
    }[],
  ): Promise<void> {
    await this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      if (!account) return;
      await queryRows(
        manager,
        "DELETE FROM graph_relationships WHERE source_id = $1 AND type = 'VERIFIED_FOR_ORG'",
        [account.nodeId],
      );
      for (const verification of organizations) {
        const organization = await this.findNode(
          "Organization",
          { orgId: verification.id },
          manager,
        );
        if (!organization) continue;
        await this.insertRelationship(
          manager,
          account.nodeId,
          organization.nodeId,
          "VERIFIED_FOR_ORG",
          {
            credential: verification.credential,
            account: verification.account,
            verifiedTimestamp: Date.now(),
          },
        );
      }
    });
  }

  async ensureOrganizationVerification(
    wallet: string,
    normalizedOrganizationName: string,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      const organization = await this.findNode(
        "Organization",
        { normalizedName: normalizedOrganizationName },
        manager,
      );
      if (!account || !organization) return false;

      const [identity] = await queryRows<{ email: string | null }>(
        manager,
        `
          SELECT COALESCE(
            (
              SELECT NULLIF(linked.properties ->> 'email', '')
              FROM graph_relationships relationship
              JOIN graph_nodes linked ON linked.id = relationship.target_id
              WHERE relationship.source_id = $1
                AND relationship.type = 'HAS_LINKED_ACCOUNT'
                AND linked.label = 'LinkedAccount'
              ORDER BY linked.id
              LIMIT 1
            ),
            (
              SELECT NULLIF(email.properties ->> 'email', '')
              FROM graph_relationships relationship
              JOIN graph_nodes email ON email.id = relationship.target_id
              WHERE relationship.source_id = $1
                AND relationship.type = 'HAS_EMAIL'
                AND email.label IN ('UserEmail', 'UserUnverifiedEmail')
              ORDER BY COALESCE(
                jsonb_boolean_value(email.properties, 'main'), false
              ) DESC, email.id
              LIMIT 1
            )
          ) AS email
        `,
        [account.nodeId],
      );
      const email = identity?.email ?? null;
      const verifiedTimestamp = Date.now();

      await this.insertRelationship(
        manager,
        account.nodeId,
        organization.nodeId,
        "VERIFIED_FOR_ORG",
        {
          credential: email ? "email" : "membership",
          account: email ?? wallet,
          verifiedTimestamp,
          verificationSource: "threat_intel_access",
        },
      );
      await this.upsertOwnedNode(
        manager,
        account.nodeId,
        "HAS_VERIFICATION_STATUS",
        "UserVerificationStatus",
        { status: "VERIFIED", verifiedTimestamp },
      );
      return true;
    });
  }

  async getVerifications(wallet: string): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ value: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT jsonb_build_object(
          'id', organization.properties -> 'orgId',
          'name', organization.properties -> 'name',
          'slug', organization.properties -> 'normalizedName',
          'url', to_jsonb(graph_first_related_text(organization.id, 'HAS_WEBSITE', 'url')),
          'logo', COALESCE(
            organization.properties -> 'logoUrl', organization.properties -> 'logo'
          ),
          'hasOwner', EXISTS (
            SELECT 1
            FROM graph_relationships organization_seat
            JOIN graph_nodes seat ON seat.id = organization_seat.target_id
            JOIN graph_relationships occupancy
              ON occupancy.target_id = seat.id AND occupancy.type = 'OCCUPIES'
            WHERE organization_seat.source_id = organization.id
              AND organization_seat.type = 'HAS_USER_SEAT'
              AND seat.properties ->> 'seatType' = 'owner'
          ),
          'isOwner', EXISTS (
            SELECT 1
            FROM graph_relationships organization_seat
            JOIN graph_nodes seat ON seat.id = organization_seat.target_id
            JOIN graph_relationships occupancy
              ON occupancy.target_id = seat.id AND occupancy.type = 'OCCUPIES'
            WHERE organization_seat.source_id = organization.id
              AND organization_seat.type = 'HAS_USER_SEAT'
              AND occupancy.source_id = account.id
              AND seat.properties ->> 'seatType' = 'owner'
          ),
          'isMember', EXISTS (
            SELECT 1
            FROM graph_relationships organization_seat
            JOIN graph_relationships occupancy
              ON occupancy.target_id = organization_seat.target_id
             AND occupancy.type = 'OCCUPIES'
            WHERE organization_seat.source_id = organization.id
              AND organization_seat.type = 'HAS_USER_SEAT'
              AND occupancy.source_id = account.id
          ),
          'credential', verification.properties -> 'credential',
          'account', verification.properties -> 'account'
        ) AS value
        FROM graph_nodes account
        JOIN graph_relationships verification
          ON verification.source_id = account.id
         AND verification.type = 'VERIFIED_FOR_ORG'
        JOIN graph_nodes organization
          ON organization.id = verification.target_id
         AND organization.label = 'Organization'
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
        ORDER BY organization.properties ->> 'name', organization.id
      `,
      [wallet],
    );
    return rows.map(row => row.value);
  }

  async setVerificationStatus(
    wallet: string,
    status: string,
    timestamp?: number | null,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      if (!account) return false;
      await this.upsertOwnedNode(
        manager,
        account.nodeId,
        "HAS_VERIFICATION_STATUS",
        "UserVerificationStatus",
        {
          status,
          verifiedTimestamp: timestamp ?? null,
        },
      );
      return true;
    });
  }

  async getVerificationStatus(
    wallet: string,
  ): Promise<Record<string, unknown> | undefined> {
    return this.getFirstOwnedNode(
      wallet,
      "HAS_VERIFICATION_STATUS",
      "UserVerificationStatus",
    );
  }

  async getShowcases(wallet: string): Promise<Record<string, unknown>[]> {
    return this.getOwnedNodes(wallet, "HAS_SHOWCASE", "UserShowCase");
  }

  async getSkills(wallet: string): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ value: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT tag.properties || jsonb_build_object(
          'canTeach', COALESCE(
            jsonb_boolean_value(relationship.properties, 'canTeach'), false
          )
        ) AS value
        FROM graph_nodes account
        JOIN graph_relationships relationship
          ON relationship.source_id = account.id AND relationship.type = 'HAS_SKILL'
        JOIN graph_nodes tag
          ON tag.id = relationship.target_id AND tag.label = 'Tag'
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
        ORDER BY tag.properties ->> 'name', tag.id
      `,
      [wallet],
    );
    return rows.map(row => row.value);
  }

  async updateLinkedAccount(
    wallet: string,
    properties: Record<string, unknown>,
  ): Promise<boolean> {
    return this.updateOwnedNode(
      wallet,
      "HAS_LINKED_ACCOUNT",
      "LinkedAccount",
      properties,
    );
  }

  async updateLocation(
    wallet: string,
    properties: Record<string, unknown>,
  ): Promise<boolean> {
    return this.updateOwnedNode(
      wallet,
      "HAS_LOCATION",
      "UserLocation",
      properties,
    );
  }

  async updateAvailability(
    wallet: string,
    available: boolean,
  ): Promise<boolean> {
    const rows = await queryRows<{ id: string }>(
      this.postgres,
      `
        UPDATE graph_nodes
        SET properties = properties || $2::jsonb, updated_at = now()
        WHERE label = 'User'
          AND lower(properties ->> 'wallet') = lower($1)
        RETURNING id::text AS id
      `,
      [wallet, JSON.stringify({ available, updatedTimestamp: Date.now() })],
    );
    return rows.length > 0;
  }

  async replaceShowcases(
    wallet: string,
    showcases: Record<string, unknown>[],
  ): Promise<boolean> {
    return this.replaceOwnedNodes(
      wallet,
      "HAS_SHOWCASE",
      "UserShowCase",
      showcases.map(showcase => ({ id: randomUUID(), ...showcase })),
    );
  }

  async replaceSkills(
    wallet: string,
    skills: { id: string; normalizedName: string; canTeach: boolean }[],
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      if (!account) return false;
      await queryRows(
        manager,
        "DELETE FROM graph_relationships WHERE source_id = $1 AND type = 'HAS_SKILL'",
        [account.nodeId],
      );
      for (const skill of skills) {
        const tag = await this.findNode(
          "Tag",
          { id: skill.id, normalizedName: skill.normalizedName },
          manager,
        );
        if (!tag) continue;
        await this.insertRelationship(
          manager,
          account.nodeId,
          tag.nodeId,
          "HAS_SKILL",
          { canTeach: skill.canTeach },
        );
      }
      return true;
    });
  }

  async upsertReview(
    wallet: string,
    orgId: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      const organization = await this.findNode(
        "Organization",
        { orgId },
        manager,
      );
      if (!account || !organization) return false;
      const profiles = await queryRows<{ nodeId: string }>(
        manager,
        `
          SELECT profile.id::text AS "nodeId"
          FROM graph_relationships membership
          JOIN graph_nodes profile
            ON profile.id = membership.source_id
           AND profile.label = 'EntityProfile'
          WHERE membership.target_id = $1
            AND membership.type = 'PROFILE_HAS_ORGANIZATION'
            AND NOT entity_property_is_banned(profile.properties)
          ORDER BY profile.id
        `,
        [organization.nodeId],
      );
      if (profiles.length !== 1) return false;

      const ratingKeys = [
        "onboarding",
        "careerGrowth",
        "benefits",
        "workLifeBalance",
        "diversityInclusion",
        "management",
        "product",
        "compensation",
      ];
      const componentRatings = ratingKeys
        .map(key => patch[key])
        .filter(
          (value): value is number =>
            typeof value === "number" && value >= 1 && value <= 5,
        );
      const explicitRating = patch.rating;
      const rating =
        typeof explicitRating === "number" &&
        explicitRating >= 1 &&
        explicitRating <= 5
          ? Math.round(explicitRating)
          : componentRatings.length
            ? Math.round(
                componentRatings.reduce((total, value) => total + value, 0) /
                  componentRatings.length,
              )
            : null;
      const reviewParts = [
        typeof patch.title === "string" ? patch.title.trim() : "",
        typeof patch.pros === "string" && patch.pros.trim()
          ? `Pros: ${patch.pros.trim()}`
          : "",
        typeof patch.cons === "string" && patch.cons.trim()
          ? `Cons: ${patch.cons.trim()}`
          : "",
      ].filter(Boolean);
      const reviewText = reviewParts.length ? reviewParts.join("\n\n") : null;
      const salary =
        Object.prototype.hasOwnProperty.call(patch, "salary") &&
        (patch.salary === null || typeof patch.salary === "number")
          ? patch.salary
          : undefined;
      const currency =
        salary === null
          ? null
          : typeof patch.currency === "string"
            ? patch.currency.trim().toUpperCase()
            : undefined;
      const tokenAllocation = Object.prototype.hasOwnProperty.call(
        patch,
        "offersTokenAllocation",
      )
        ? patch.offersTokenAllocation
        : undefined;
      const inserted = await queryRows(
        manager,
        `
          INSERT INTO profile_reviews (
            profile_node_id, child_node_id, author_user_id, rating,
            review_text, salary, currency, offers_token_allocation,
            status, ownership_fingerprint, legacy_payload
          ) VALUES (
            $1::bigint, $2::bigint, lower($3), $4::integer, $5,
            $6::numeric, $7, $8::boolean, 'pending',
            encode(digest(concat_ws(':', $1, $2, lower($3)), 'sha256'), 'hex'),
            $9::jsonb
          )
          ON CONFLICT (profile_node_id, child_node_id, author_user_id)
            WHERE legacy_review_node_id IS NULL
          DO UPDATE SET
            rating = COALESCE(EXCLUDED.rating, profile_reviews.rating),
            review_text = COALESCE(
              EXCLUDED.review_text, profile_reviews.review_text
            ),
            salary = CASE WHEN EXCLUDED.legacy_payload ? 'salary'
              THEN EXCLUDED.salary ELSE profile_reviews.salary END,
            currency = CASE WHEN EXCLUDED.legacy_payload ? 'salary'
              THEN EXCLUDED.currency ELSE profile_reviews.currency END,
            offers_token_allocation = CASE
              WHEN EXCLUDED.legacy_payload ? 'offersTokenAllocation'
                THEN EXCLUDED.offers_token_allocation
              ELSE profile_reviews.offers_token_allocation END,
            status = 'pending',
            redacted_public_text = NULL,
            decided_at = NULL,
            decided_by = NULL,
            legacy_payload = profile_reviews.legacy_payload
              || EXCLUDED.legacy_payload
          RETURNING id
        `,
        [
          profiles[0].nodeId,
          organization.nodeId,
          wallet,
          rating,
          reviewText,
          salary,
          currency,
          tokenAllocation,
          JSON.stringify(patch),
        ],
      );
      return inserted.length === 1;
    });
  }

  async findReview(id: string): Promise<Record<string, unknown> | undefined> {
    const [review] = await queryRows<{ properties: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT jsonb_build_object(
          'id', review.id::text,
          'title', COALESCE(
            review.legacy_payload -> 'title', to_jsonb(review.review_text)
          ),
          'location', review.legacy_payload -> 'location',
          'timezone', review.legacy_payload -> 'timezone',
          'pros', review.legacy_payload -> 'pros',
          'cons', review.legacy_payload -> 'cons'
        ) AS properties
        FROM profile_reviews review
        JOIN graph_nodes organization
          ON organization.id = review.child_node_id
         AND organization.label = 'Organization'
        JOIN graph_relationships membership
          ON membership.source_id = review.profile_node_id
         AND membership.target_id = organization.id
         AND membership.type = 'PROFILE_HAS_ORGANIZATION'
        WHERE review.id = $1::uuid
          AND review.status <> 'removed'
        LIMIT 1
      `,
      [id],
    );
    return review?.properties;
  }

  async updateRepoContribution(
    wallet: string,
    repositoryId: string,
    summary: string,
  ): Promise<boolean> {
    const rows = await queryRows<{ id: string }>(
      this.postgres,
      `
        UPDATE graph_relationships contribution
        SET properties = contribution.properties || jsonb_build_object(
          'summary', $3::text
        ), updated_at = now()
        FROM graph_nodes account, graph_relationships account_github,
          graph_nodes github, graph_nodes repository
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
          AND account_github.source_id = account.id
          AND account_github.type = 'HAS_GITHUB_USER'
          AND github.id = account_github.target_id
          AND contribution.source_id = github.id
          AND contribution.type = 'CONTRIBUTED_TO'
          AND repository.id = contribution.target_id
          AND repository.label = 'GithubRepository'
          AND repository.properties ->> 'id' = $2
        RETURNING contribution.id::text AS id
      `,
      [wallet, repositoryId, summary],
    );
    return rows.length > 0;
  }

  async updateRepoTags(
    wallet: string,
    repositoryId: string,
    tags: { normalizedName: string; canTeach: boolean }[],
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const [context] = await queryRows<{
        accountId: string;
        githubId: string;
        repositoryNodeId: string;
      }>(
        manager,
        `
          SELECT account.id::text AS "accountId", github.id::text AS "githubId",
            repository.id::text AS "repositoryNodeId"
          FROM graph_nodes account
          JOIN graph_relationships account_github
            ON account_github.source_id = account.id
           AND account_github.type = 'HAS_GITHUB_USER'
          JOIN graph_nodes github ON github.id = account_github.target_id
          JOIN graph_relationships contribution
            ON contribution.source_id = github.id
           AND contribution.type = 'CONTRIBUTED_TO'
          JOIN graph_nodes repository ON repository.id = contribution.target_id
          WHERE account.label = 'User'
            AND lower(account.properties ->> 'wallet') = lower($1)
            AND repository.properties ->> 'id' = $2
          LIMIT 1
        `,
        [wallet, repositoryId],
      );
      if (!context) return false;
      await queryRows(
        manager,
        `
          WITH old_tags AS MATERIALIZED (
            SELECT DISTINCT used_tag.target_id AS tag_id
            FROM graph_relationships used_tag
            JOIN graph_relationships used_on
              ON used_on.source_id = used_tag.target_id
             AND used_on.target_id = $2
             AND used_on.type = 'USED_ON'
            WHERE used_tag.source_id = $1
              AND used_tag.type = 'USED_TAG'
          )
          DELETE FROM graph_relationships relationship
          USING old_tags
          WHERE (
              relationship.source_id = $1
              AND relationship.target_id = old_tags.tag_id
              AND relationship.type = 'USED_TAG'
            ) OR (
              relationship.source_id = old_tags.tag_id
              AND relationship.target_id = $2
              AND relationship.type = 'USED_ON'
            )
        `,
        [context.githubId, context.repositoryNodeId],
      );
      const tagNodes = await queryRows<NodeRecord>(
        manager,
        `
          SELECT id::text AS "nodeId", properties
          FROM graph_nodes
          WHERE label = 'Tag'
            AND properties ->> 'normalizedName' = ANY($1::text[])
        `,
        [[...new Set(tags.map(tag => tag.normalizedName))]],
      );
      for (const tag of tagNodes) {
        const input = tags.find(
          value => value.normalizedName === tag.properties.normalizedName,
        );
        await this.insertRelationship(
          manager,
          context.accountId,
          tag.nodeId,
          "HAS_SKILL",
          { canTeach: input?.canTeach ?? false },
        );
        await this.insertRelationship(
          manager,
          context.githubId,
          tag.nodeId,
          "USED_TAG",
        );
        await this.insertRelationship(
          manager,
          tag.nodeId,
          context.repositoryNodeId,
          "USED_ON",
        );
      }
      return true;
    });
  }

  async getCacheLock(wallet: string): Promise<number | null> {
    const [row] = await queryRows<{ expiresAt: string }>(
      this.postgres,
      `
        SELECT lock.expires_at::text AS "expiresAt"
        FROM user_cache_locks lock
        JOIN graph_nodes account ON account.id = lock.user_node_id
        WHERE lower(account.properties ->> 'wallet') = lower($1)
      `,
      [wallet],
    );
    return row ? Number(row.expiresAt) : null;
  }

  async setCacheLocks(
    wallets: string[],
    expiresAt: number,
  ): Promise<number | null> {
    const rows = await queryRows<{ expiresAt: string }>(
      this.postgres,
      `
        INSERT INTO user_cache_locks (user_node_id, expires_at, updated_at)
        SELECT id, $2, now()
        FROM graph_nodes
        WHERE label = 'User'
          AND lower(properties ->> 'wallet') = ANY($1::text[])
        ON CONFLICT (user_node_id) DO UPDATE SET
          expires_at = EXCLUDED.expires_at,
          updated_at = now()
        RETURNING expires_at::text AS "expiresAt"
      `,
      [[...new Set(wallets.map(wallet => wallet.toLowerCase()))], expiresAt],
    );
    return rows[0] ? Number(rows[0].expiresAt) : null;
  }

  async replaceWorkHistory(
    wallet: string,
    cryptoNative: boolean,
    cryptoAdjacent: boolean,
    workHistory: Record<string, unknown>[],
    adjacentRepos: Record<string, unknown>[],
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      if (!account) return false;
      await queryRows(
        manager,
        `
          DELETE FROM graph_nodes repository
          USING graph_relationships account_history,
            graph_relationships history_repository
          WHERE account_history.source_id = $1
            AND account_history.type = 'HAS_WORK_HISTORY'
            AND history_repository.source_id = account_history.target_id
            AND history_repository.type = 'WORKED_ON_REPO'
            AND repository.id = history_repository.target_id
            AND repository.label = 'UserWorkHistoryRepo'
        `,
        [account.nodeId],
      );
      await this.deleteOwnedNodes(manager, account.nodeId, [
        "HAS_WORK_HISTORY",
        "HAS_ADJACENT_REPO",
      ]);
      await queryRows(
        manager,
        `
          UPDATE graph_nodes SET properties = properties || $2::jsonb,
            updated_at = now() WHERE id = $1
        `,
        [account.nodeId, JSON.stringify({ cryptoNative, cryptoAdjacent })],
      );
      for (const history of workHistory) {
        const repositories = Array.isArray(history.repositories)
          ? (history.repositories as Record<string, unknown>[])
          : [];
        const historyNode = await this.insertNode(manager, "UserWorkHistory", {
          ...history,
          repositories: undefined,
          compositeKey: `${wallet}::${String(history.name ?? history.login ?? "")}`,
          createdAt: history.createdAt ?? Date.now(),
          updatedAt: history.updatedAt ?? null,
        });
        await this.insertRelationship(
          manager,
          account.nodeId,
          historyNode,
          "HAS_WORK_HISTORY",
        );
        for (const repository of repositories) {
          const repositoryNode = await this.insertNode(
            manager,
            "UserWorkHistoryRepo",
            {
              ...repository,
              compositeKey: `${wallet}::${String(history.name ?? history.login ?? "")}::${String(repository.url ?? repository.name ?? "")}`,
              createdAt: repository.createdAt ?? Date.now(),
              updatedAt: repository.updatedAt ?? null,
            },
          );
          await this.insertRelationship(
            manager,
            historyNode,
            repositoryNode,
            "WORKED_ON_REPO",
          );
        }
      }
      for (const adjacent of adjacentRepos) {
        const node = await this.insertNode(manager, "UserAdjacentRepo", {
          ...adjacent,
          createdAt: adjacent.createdAt ?? Date.now(),
          updatedAt: adjacent.updatedAt ?? null,
        });
        await this.insertRelationship(
          manager,
          account.nodeId,
          node,
          "HAS_ADJACENT_REPO",
        );
      }
      return true;
    });
  }

  async replaceGithubRepositories(
    wallet: string,
    organizations: {
      login: string;
      repositories: { name: string; description?: string | null }[];
    }[],
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const [github] = await queryRows<{ nodeId: string }>(
        manager,
        `
          SELECT target_id::text AS "nodeId"
          FROM graph_relationships relationship
          JOIN graph_nodes account ON account.id = relationship.source_id
          WHERE account.label = 'User'
            AND lower(account.properties ->> 'wallet') = lower($1)
            AND relationship.type = 'HAS_GITHUB_USER'
          LIMIT 1
        `,
        [wallet],
      );
      if (!github) return false;
      const names: string[] = [];
      for (const organization of organizations) {
        const githubOrganization = await this.findNode(
          "GithubOrganization",
          { login: organization.login },
          manager,
        );
        for (const repository of organization.repositories) {
          const nameWithOwner = `${organization.login}/${repository.name}`;
          names.push(nameWithOwner);
          let repo = await this.findNode(
            "GithubRepository",
            { nameWithOwner },
            manager,
          );
          if (!repo) {
            const nodeId = await this.insertNode(manager, "GithubRepository", {
              id: randomUUID(),
              name: repository.name,
              nameWithOwner,
              description: repository.description ?? null,
              createdTimestamp: Date.now(),
              updatedTimestamp: Date.now(),
            });
            repo = { nodeId, properties: { nameWithOwner } };
          } else {
            await queryRows(
              manager,
              `
                UPDATE graph_nodes
                SET properties = properties || jsonb_build_object(
                  'name', $2::text,
                  'nameWithOwner', $3::text,
                  'description', to_jsonb($4::text),
                  'updatedTimestamp', $5::bigint
                ), updated_at = now()
                WHERE id = $1
              `,
              [
                repo.nodeId,
                repository.name,
                nameWithOwner,
                repository.description ?? null,
                Date.now(),
              ],
            );
          }
          await this.insertRelationship(
            manager,
            github.nodeId,
            repo.nodeId,
            "CONTRIBUTED_TO",
          );
          if (githubOrganization) {
            await this.insertRelationship(
              manager,
              githubOrganization.nodeId,
              repo.nodeId,
              "HAS_REPOSITORY",
            );
          }
        }
      }
      await queryRows(
        manager,
        `
          DELETE FROM graph_relationships relationship
          USING graph_nodes repository
          WHERE relationship.source_id = $1
            AND relationship.target_id = repository.id
            AND relationship.type = 'CONTRIBUTED_TO'
            AND NOT (repository.properties ->> 'nameWithOwner' = ANY($2::text[]))
        `,
        [github.nodeId, names],
      );
      return true;
    });
  }

  async blockOrganizationJobs(wallet: string, orgId: string): Promise<boolean> {
    return this.setDirectRelationship(
      wallet,
      "Organization",
      { orgId },
      "BLOCKED_ORG_JOBS",
    );
  }

  async setJobInteraction(
    wallet: string,
    shortUuid: string,
    type: "APPLIED_TO" | "BOOKMARKED" | "VIEWED_DETAILS",
  ): Promise<boolean> {
    const account = await this.findNode("User", { wallet });
    const [job] = await queryRows<{ nodeId: string }>(
      this.postgres,
      `SELECT job_node_id::text AS "nodeId" FROM job_search_documents WHERE short_uuid = $1`,
      [shortUuid],
    );
    if (!account || !job) return false;
    await this.insertRelationship(
      this.postgres,
      account.nodeId,
      job.nodeId,
      type,
      { createdTimestamp: Date.now() },
    );
    return true;
  }

  async hasJobInteraction(
    wallet: string,
    shortUuid: string,
    type: "APPLIED_TO" | "BOOKMARKED" | "VIEWED_DETAILS",
  ): Promise<boolean> {
    const [row] = await queryRows<{ found: boolean }>(
      this.postgres,
      `
        SELECT EXISTS (
          SELECT 1
          FROM graph_nodes account
          JOIN graph_relationships relationship
            ON relationship.source_id = account.id AND relationship.type = $3
          JOIN job_search_documents job
            ON job.job_node_id = relationship.target_id
          WHERE account.label = 'User'
            AND lower(account.properties ->> 'wallet') = lower($1)
            AND job.short_uuid = $2
        ) AS found
      `,
      [wallet, shortUuid, type],
    );
    return row?.found ?? false;
  }

  async removeJobInteraction(
    wallet: string,
    shortUuid: string,
    type: "APPLIED_TO" | "BOOKMARKED" | "VIEWED_DETAILS",
  ): Promise<boolean> {
    const rows = await queryRows<{ id: string }>(
      this.postgres,
      `
        DELETE FROM graph_relationships relationship
        USING graph_nodes account, job_search_documents job
        WHERE relationship.source_id = account.id
          AND relationship.target_id = job.job_node_id
          AND relationship.type = $3
          AND account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
          AND job.short_uuid = $2
        RETURNING relationship.id::text AS id
      `,
      [wallet, shortUuid, type],
    );
    return rows.length > 0;
  }

  async logSearch(wallet: string, query: string): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      if (!account) return false;
      const [existing] = await queryRows<{ nodeId: string }>(
        manager,
        `
          SELECT search.id::text AS "nodeId"
          FROM graph_relationships relationship
          JOIN graph_nodes search ON search.id = relationship.target_id
          WHERE relationship.source_id = $1
            AND relationship.type = 'DID_SEARCH'
            AND search.label = 'SearchHistory'
            AND search.properties ->> 'query' = $2
          ORDER BY search.id
          LIMIT 1
        `,
        [account.nodeId, query],
      );
      const search =
        existing?.nodeId ??
        (await this.insertNode(manager, "SearchHistory", {
          id: randomUUID(),
          query,
          createdTimestamp: Date.now(),
        }));
      await this.insertRelationship(
        manager,
        account.nodeId,
        search,
        "DID_SEARCH",
        { createdTimestamp: Date.now() },
      );
      return true;
    });
  }

  async getWorkHistory(wallet: string): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ value: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT history.properties || jsonb_build_object(
          'repositories', COALESCE((
            SELECT jsonb_agg(repository.properties ORDER BY repository.id)
            FROM graph_relationships relationship
            JOIN graph_nodes repository ON repository.id = relationship.target_id
            WHERE relationship.source_id = history.id
              AND relationship.type = 'WORKED_ON_REPO'
          ), '[]'::jsonb)
        ) AS value
        FROM graph_nodes account
        JOIN graph_relationships relationship
          ON relationship.source_id = account.id
         AND relationship.type = 'HAS_WORK_HISTORY'
        JOIN graph_nodes history ON history.id = relationship.target_id
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
        ORDER BY history.id
      `,
      [wallet],
    );
    return rows.map(row => row.value);
  }

  async getAdjacentRepos(wallet: string): Promise<Record<string, unknown>[]> {
    return this.getOwnedNodes(wallet, "HAS_ADJACENT_REPO", "UserAdjacentRepo");
  }

  private async getVerificationOrganizations(
    wallet: string,
    predicate: string,
    parameters: unknown[],
  ): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ value: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT organization.properties || jsonb_build_object(
          'id', organization.properties -> 'orgId',
          'url', to_jsonb(graph_first_related_text(organization.id, 'HAS_WEBSITE', 'url')),
          'logo', COALESCE(
            organization.properties -> 'logoUrl', organization.properties -> 'logo'
          ),
          'hasOwner', EXISTS (
            SELECT 1 FROM graph_relationships organization_seat
            JOIN graph_nodes seat ON seat.id = organization_seat.target_id
            JOIN graph_relationships occupancy
              ON occupancy.target_id = seat.id AND occupancy.type = 'OCCUPIES'
            WHERE organization_seat.source_id = organization.id
              AND organization_seat.type = 'HAS_USER_SEAT'
              AND seat.properties ->> 'seatType' = 'owner'
          ),
          'isOwner', EXISTS (
            SELECT 1 FROM graph_relationships organization_seat
            JOIN graph_nodes seat ON seat.id = organization_seat.target_id
            JOIN graph_relationships occupancy
              ON occupancy.target_id = seat.id AND occupancy.type = 'OCCUPIES'
            WHERE organization_seat.source_id = organization.id
              AND organization_seat.type = 'HAS_USER_SEAT'
              AND occupancy.source_id = account.id
              AND seat.properties ->> 'seatType' = 'owner'
          ),
          'isMember', EXISTS (
            SELECT 1 FROM graph_relationships organization_seat
            JOIN graph_relationships occupancy
              ON occupancy.target_id = organization_seat.target_id
             AND occupancy.type = 'OCCUPIES'
            WHERE organization_seat.source_id = organization.id
              AND organization_seat.type = 'HAS_USER_SEAT'
              AND occupancy.source_id = account.id
          )
        ) AS value
        FROM graph_nodes organization
        LEFT JOIN graph_nodes account
          ON account.label = 'User'
         AND lower(account.properties ->> 'wallet') = lower($1)
        WHERE organization.label = 'Organization' AND ${predicate}
        ORDER BY organization.id
      `,
      [wallet, ...parameters],
    );
    return rows.map(row => row.value);
  }

  private async updateOwnedNode(
    wallet: string,
    relationshipType: string,
    label: string,
    properties: Record<string, unknown>,
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      if (!account) return false;
      await this.upsertOwnedNode(
        manager,
        account.nodeId,
        relationshipType,
        label,
        properties,
      );
      return true;
    });
  }

  private async replaceOwnedNodes(
    wallet: string,
    relationshipType: string,
    label: string,
    nodes: Record<string, unknown>[],
  ): Promise<boolean> {
    return this.postgres.transaction(async manager => {
      const account = await this.findNode("User", { wallet }, manager);
      if (!account) return false;
      await this.deleteOwnedNodes(manager, account.nodeId, [relationshipType]);
      for (const properties of nodes) {
        const node = await this.insertNode(manager, label, properties);
        await this.insertRelationship(
          manager,
          account.nodeId,
          node,
          relationshipType,
        );
      }
      return true;
    });
  }

  private async deleteOwnedNodes(
    manager: EntityManager,
    accountNodeId: string,
    relationshipTypes: string[],
  ): Promise<void> {
    const rows = await queryRows<{ nodeId: string }>(
      manager,
      `
        SELECT target_id::text AS "nodeId"
        FROM graph_relationships
        WHERE source_id = $1 AND type = ANY($2::text[])
      `,
      [accountNodeId, relationshipTypes],
    );
    if (rows.length) {
      await queryRows(
        manager,
        "DELETE FROM graph_nodes WHERE id = ANY($1::bigint[])",
        [rows.map(row => row.nodeId)],
      );
    }
  }

  private async upsertOwnedNode(
    manager: EntityManager,
    accountNodeId: string,
    relationshipType: string,
    label: string,
    patch: Record<string, unknown>,
  ): Promise<string> {
    const [existing] = await queryRows<{ nodeId: string }>(
      manager,
      `
        SELECT target.id::text AS "nodeId"
        FROM graph_relationships relationship
        JOIN graph_nodes target ON target.id = relationship.target_id
        WHERE relationship.source_id = $1 AND relationship.type = $2
          AND target.label = $3
        ORDER BY target.id LIMIT 1
      `,
      [accountNodeId, relationshipType, label],
    );
    const values = {
      ...patch,
      ...(existing
        ? { updatedTimestamp: Date.now() }
        : { id: randomUUID(), createdTimestamp: Date.now() }),
    };
    if (existing) {
      await queryRows(
        manager,
        "UPDATE graph_nodes SET properties = properties || $2::jsonb, updated_at = now() WHERE id = $1",
        [existing.nodeId, JSON.stringify(values)],
      );
      return existing.nodeId;
    }
    const node = await this.insertNode(manager, label, values);
    await this.insertRelationship(
      manager,
      accountNodeId,
      node,
      relationshipType,
    );
    return node;
  }

  private async getFirstOwnedNode(
    wallet: string,
    relationshipType: string,
    label: string,
  ): Promise<Record<string, unknown> | undefined> {
    return (await this.getOwnedNodes(wallet, relationshipType, label))[0];
  }

  private async getOwnedNodes(
    wallet: string,
    relationshipType: string,
    label: string,
  ): Promise<Record<string, unknown>[]> {
    const rows = await queryRows<{ properties: Record<string, unknown> }>(
      this.postgres,
      `
        SELECT target.properties
        FROM graph_nodes account
        JOIN graph_relationships relationship
          ON relationship.source_id = account.id AND relationship.type = $2
        JOIN graph_nodes target
          ON target.id = relationship.target_id AND target.label = $3
        WHERE account.label = 'User'
          AND lower(account.properties ->> 'wallet') = lower($1)
        ORDER BY target.id
      `,
      [wallet, relationshipType, label],
    );
    return rows.map(row => row.properties);
  }

  private async setDirectRelationship(
    wallet: string,
    targetLabel: string,
    targetWhere: Record<string, unknown>,
    type: string,
  ): Promise<boolean> {
    const account = await this.findNode("User", { wallet });
    const target = await this.findNode(targetLabel, targetWhere);
    if (!account || !target) return false;
    await this.insertRelationship(
      this.postgres,
      account.nodeId,
      target.nodeId,
      type,
      { createdTimestamp: Date.now() },
    );
    return true;
  }

  private async findNode(
    label: string,
    where: Record<string, unknown>,
    executor: QueryExecutor = this.postgres,
  ): Promise<NodeRecord | undefined> {
    const [row] = await queryRows<NodeRecord>(
      executor,
      `
        SELECT id::text AS "nodeId", properties
        FROM graph_nodes
        WHERE label = $1 AND properties @> $2::jsonb
        ORDER BY id LIMIT 1
      `,
      [label, JSON.stringify(where)],
    );
    return row;
  }

  private async insertNode(
    executor: QueryExecutor,
    label: string,
    properties: Record<string, unknown>,
  ): Promise<string> {
    const cleanProperties = Object.fromEntries(
      Object.entries(properties).filter(([, value]) => value !== undefined),
    );
    const id = String(cleanProperties.id ?? randomUUID());
    const [row] = await queryRows<{ nodeId: string }>(
      executor,
      `
        INSERT INTO graph_nodes (label, labels, node_key, properties)
        VALUES ($1, ARRAY[$1]::text[], $2, $3::jsonb)
        RETURNING id::text AS "nodeId"
      `,
      [
        label,
        `runtime:${label}:${id}`,
        JSON.stringify({ ...cleanProperties, id }),
      ],
    );
    return row.nodeId;
  }

  private async insertRelationship(
    executor: QueryExecutor,
    sourceId: string,
    targetId: string,
    type: string,
    properties: Record<string, unknown> = {},
  ): Promise<void> {
    await queryRows(
      executor,
      `
        INSERT INTO graph_relationships (
          source_id, target_id, type, relationship_key, properties
        ) VALUES ($1, $2, $3, '', $4::jsonb)
        ON CONFLICT (source_id, target_id, type, relationship_key) DO UPDATE SET
          properties = graph_relationships.properties || EXCLUDED.properties,
          updated_at = now()
      `,
      [sourceId, targetId, type, JSON.stringify(properties)],
    );
  }
}
