import { Injectable } from "@nestjs/common";
import { PostgresService } from "./postgres.service";

const MAX_ANNUAL_SALARY_RANGE_USD = 200_000;

export interface JobMarketMetricRow extends Record<string, unknown> {
  kind: string;
  slug: string;
  label: string;
  sampleDate: string;
  activeJobs: string;
  hiringCompanies: string;
  newJobs: string;
  salaryMedianMonthlyUsd: string | null;
  salaryMeanMonthlyUsd: string | null;
  salaryP25MonthlyUsd: string | null;
  salaryP75MonthlyUsd: string | null;
  salarySampleCount: string;
  salaryEmployerCount: string;
  salaryCoverage: string;
  source: "reconstructed" | "snapshot";
  sampledAt: string;
  currentWindowJobs?: string;
  previousWindowJobs?: string;
  currentActiveJobs?: string | null;
  baselineActiveJobs?: string | null;
  currentHiringCompanies?: string | null;
  baselineHiringCompanies?: string | null;
}

export interface JobMarketGeographyRow extends Record<string, unknown> {
  asOfDate: string;
  rangeKey: "90" | "365" | "max";
  dimensionKind: string;
  dimensionSlug: string;
  regionKey: string;
  regionSlug: string;
  regionLabel: string;
  regionType:
    | "remote"
    | "aggregate"
    | "continent"
    | "country"
    | "region"
    | "city";
  filterKey: "cities" | "regions" | "countries" | "continents" | null;
  filterValue: string | null;
  countryCode: string | null;
  segment: "remote" | "local";
  salaryMedianMonthlyUsd: string | null;
  salaryP25MonthlyUsd: string | null;
  salaryP75MonthlyUsd: string | null;
  adjustedPremiumPercent: string | null;
  salarySampleCount: string;
  employerCount: string;
  onsiteCount: string;
  hybridCount: string;
  remoteCount: string;
  regionalActiveJobs?: string;
  regionalHiringCompanies?: string;
  regionalActiveOnsiteJobs?: string;
  regionalActiveHybridJobs?: string;
  regionalActiveRemoteJobs?: string;
  maxEmployerShare?: string | null;
  observedMonthCount?: string | null;
}

export interface JobMarketSkillRow extends JobMarketGeographyRow {
  label: string;
  activeJobs: string;
  hiringCompanies: string;
  currentWindowJobs: string;
  previousWindowJobs: string;
  currentActiveJobs: string | null;
  baselineActiveJobs: string | null;
  currentHiringCompanies: string | null;
  baselineHiringCompanies: string | null;
  signalAsOf: string | null;
  signalStatus: "rising" | "falling" | "stable" | "insufficient" | null;
  currentMedianMonthlyUsd: string | null;
  baselineMedianMonthlyUsd: string | null;
  rawChangePercent: string | null;
  adjustedChangePercent: string | null;
  confidenceLowPercent: string | null;
  confidenceHighPercent: string | null;
  qValue: string | null;
  recentJobCount: string | null;
  baselineJobCount: string | null;
  recentEmployerCount: string | null;
  baselineEmployerCount: string | null;
  signalSince: string | null;
  openJobShare?: string;
}

export interface JobMarketCompensationBandRow extends Record<string, unknown> {
  segment: "remote" | "local";
  senioritySlug: string;
  seniorityLabel: string;
  salaryMedianMonthlyUsd: string | null;
  salaryP25MonthlyUsd: string | null;
  salaryP75MonthlyUsd: string | null;
  salarySampleCount: string;
  employerCount: string;
  maxEmployerShare: string | null;
  observedMonthCount: string;
}

export interface JobMarketSkillWeeklyRow extends Record<string, unknown> {
  weekStart: string;
  slug: string;
  label: string;
  segment: "remote" | "local";
  regionSlug: string;
  regionLabel: string;
  salaryMedianMonthlyUsd: string | null;
  salaryP25MonthlyUsd: string | null;
  salaryP75MonthlyUsd: string | null;
  adjustedPremiumPercent: string | null;
  salarySampleCount: string;
  employerCount: string;
  onsiteCount: string;
  hybridCount: string;
  remoteCount: string;
}

export interface JobMarketTopPayingTag {
  slug: string;
  label: string;
}

export interface JobMarketTopPayingRow extends Record<string, unknown> {
  asOfDate: string;
  salaryJobCount: string;
  topDecileThresholdMonthlyUsd: string;
  topDecileJobCount: string;
  jobNodeId: string;
  shortUuid: string;
  title: string;
  organizationName: string | null;
  organizationLogoUrl: string | null;
  classificationSlug: string;
  classificationLabel: string;
  seniority: string | null;
  location: string | null;
  locationTypes: string[];
  onsite: boolean;
  hybrid: boolean;
  remote: boolean;
  publishedAt: string | null;
  salaryMonthlyUsd: string;
  tags: JobMarketTopPayingTag[];
}

@Injectable()
export class JobMarketRepository {
  constructor(private readonly postgres: PostgresService) {}

  getOverviewHistory(days = 35): Promise<JobMarketMetricRow[]> {
    return this.postgres.query<JobMarketMetricRow>(
      `
        WITH market_pillar AS (
          SELECT id FROM job_market_pillars WHERE slug = 'market'
        ), target_pillars AS (
          SELECT id, kind, slug, label
          FROM job_market_pillars
          WHERE kind IN ('market', 'classifications')
        ), latest AS (
          SELECT max(metric.sample_date) AS sample_date
          FROM job_market_daily_metrics metric
          JOIN market_pillar pillar ON pillar.id = metric.pillar_id
        ), sample_dates AS (
          SELECT metric.sample_date, metric.source, metric.sampled_at
          FROM job_market_daily_metrics metric
          JOIN market_pillar pillar ON pillar.id = metric.pillar_id
          CROSS JOIN latest
          WHERE metric.sample_date >= latest.sample_date - ($1::int - 1)
        )
        SELECT target.kind, target.slug, target.label,
          dates.sample_date::text AS "sampleDate",
          COALESCE(metric.active_jobs, 0)::text AS "activeJobs",
          COALESCE(metric.hiring_companies, 0)::text AS "hiringCompanies",
          COALESCE(metric.new_jobs, 0)::text AS "newJobs",
          metric.salary_median_monthly_usd::text
            AS "salaryMedianMonthlyUsd",
          metric.salary_mean_monthly_usd::text AS "salaryMeanMonthlyUsd",
          metric.salary_p25_monthly_usd::text AS "salaryP25MonthlyUsd",
          metric.salary_p75_monthly_usd::text AS "salaryP75MonthlyUsd",
          COALESCE(metric.salary_sample_count, 0)::text
            AS "salarySampleCount",
          COALESCE(metric.salary_employer_count, 0)::text
            AS "salaryEmployerCount",
          COALESCE(metric.salary_coverage, 0)::text AS "salaryCoverage",
          COALESCE(metric.source, dates.source) AS source,
          COALESCE(metric.sampled_at, dates.sampled_at) AS "sampledAt"
        FROM sample_dates dates
        CROSS JOIN target_pillars target
        LEFT JOIN job_market_daily_metrics metric
          ON metric.sample_date = dates.sample_date
         AND metric.pillar_id = target.id
        ORDER BY target.slug, dates.sample_date
      `,
      [days],
    );
  }

  getPillarHistory(
    slug: string,
    days: number | null,
  ): Promise<JobMarketMetricRow[]> {
    return this.postgres.query<JobMarketMetricRow>(
      `
        WITH market_pillar AS (
          SELECT id FROM job_market_pillars WHERE slug = 'market'
        ), target_pillar AS (
          SELECT id, kind, slug, label
          FROM job_market_pillars
          WHERE slug = $1
        ), latest AS (
          SELECT max(metric.sample_date) AS sample_date
          FROM job_market_daily_metrics metric
          JOIN market_pillar pillar ON pillar.id = metric.pillar_id
        ), sample_dates AS (
          SELECT metric.sample_date, metric.source, metric.sampled_at
          FROM job_market_daily_metrics metric
          JOIN market_pillar pillar ON pillar.id = metric.pillar_id
          CROSS JOIN latest
          WHERE $2::int IS NULL
             OR metric.sample_date >= latest.sample_date - ($2::int - 1)
        )
        SELECT target.kind, target.slug, target.label,
          dates.sample_date::text AS "sampleDate",
          COALESCE(metric.active_jobs, 0)::text AS "activeJobs",
          COALESCE(metric.hiring_companies, 0)::text AS "hiringCompanies",
          COALESCE(metric.new_jobs, 0)::text AS "newJobs",
          metric.salary_median_monthly_usd::text
            AS "salaryMedianMonthlyUsd",
          metric.salary_mean_monthly_usd::text AS "salaryMeanMonthlyUsd",
          metric.salary_p25_monthly_usd::text AS "salaryP25MonthlyUsd",
          metric.salary_p75_monthly_usd::text AS "salaryP75MonthlyUsd",
          COALESCE(metric.salary_sample_count, 0)::text
            AS "salarySampleCount",
          COALESCE(metric.salary_employer_count, 0)::text
            AS "salaryEmployerCount",
          COALESCE(metric.salary_coverage, 0)::text AS "salaryCoverage",
          COALESCE(metric.source, dates.source) AS source,
          COALESCE(metric.sampled_at, dates.sampled_at) AS "sampledAt"
        FROM sample_dates dates
        CROSS JOIN target_pillar target
        LEFT JOIN job_market_daily_metrics metric
          ON metric.sample_date = dates.sample_date
         AND metric.pillar_id = target.id
        ORDER BY dates.sample_date
      `,
      [slug, days],
    );
  }

  getOverview(): Promise<JobMarketMetricRow[]> {
    return this.postgres.query<JobMarketMetricRow>(`
      WITH market_pillar AS (
        SELECT id FROM job_market_pillars WHERE slug = 'market'
      ), latest AS (
        SELECT max(metric.sample_date) AS sample_date
        FROM job_market_daily_metrics metric
        JOIN market_pillar pillar ON pillar.id = metric.pillar_id
      ), windows AS (
        SELECT metric.pillar_id,
          COALESCE(sum(metric.new_jobs) FILTER (
            WHERE metric.sample_date > latest.sample_date - 7
          ), 0)::int AS current_window_jobs,
          COALESCE(sum(metric.new_jobs) FILTER (
            WHERE metric.sample_date > latest.sample_date - 14
              AND metric.sample_date <= latest.sample_date - 7
          ), 0)::int AS previous_window_jobs
        FROM job_market_daily_metrics metric
        CROSS JOIN latest
        WHERE metric.sample_date > latest.sample_date - 14
        GROUP BY metric.pillar_id
      ), demand_windows AS (
        SELECT metric.pillar_id,
          percentile_cont(0.5) WITHIN GROUP (
            ORDER BY metric.active_jobs
          ) FILTER (
            WHERE metric.sample_date > latest.sample_date - 7
          ) AS current_active_jobs,
          percentile_cont(0.5) WITHIN GROUP (
            ORDER BY metric.active_jobs
          ) FILTER (
            WHERE metric.sample_date > latest.sample_date - 35
              AND metric.sample_date <= latest.sample_date - 7
          ) AS baseline_active_jobs,
          percentile_cont(0.5) WITHIN GROUP (
            ORDER BY metric.hiring_companies
          ) FILTER (
            WHERE metric.sample_date > latest.sample_date - 7
          ) AS current_hiring_companies,
          percentile_cont(0.5) WITHIN GROUP (
            ORDER BY metric.hiring_companies
          ) FILTER (
            WHERE metric.sample_date > latest.sample_date - 35
              AND metric.sample_date <= latest.sample_date - 7
          ) AS baseline_hiring_companies
        FROM job_market_daily_metrics metric
        CROSS JOIN latest
        WHERE metric.sample_date > latest.sample_date - 35
        GROUP BY metric.pillar_id
      )
      SELECT pillar.kind, pillar.slug, pillar.label,
        metric.sample_date::text AS "sampleDate",
        metric.active_jobs::text AS "activeJobs",
        metric.hiring_companies::text AS "hiringCompanies",
        metric.new_jobs::text AS "newJobs",
        metric.salary_median_monthly_usd::text
          AS "salaryMedianMonthlyUsd",
        metric.salary_mean_monthly_usd::text AS "salaryMeanMonthlyUsd",
        metric.salary_p25_monthly_usd::text AS "salaryP25MonthlyUsd",
        metric.salary_p75_monthly_usd::text AS "salaryP75MonthlyUsd",
          metric.salary_sample_count::text AS "salarySampleCount",
          metric.salary_employer_count::text AS "salaryEmployerCount",
          metric.salary_coverage::text AS "salaryCoverage",
        metric.source, metric.sampled_at AS "sampledAt",
        COALESCE(windows.current_window_jobs, 0)::text
          AS "currentWindowJobs",
        COALESCE(windows.previous_window_jobs, 0)::text
          AS "previousWindowJobs",
        demand.current_active_jobs::text AS "currentActiveJobs",
        demand.baseline_active_jobs::text AS "baselineActiveJobs",
        demand.current_hiring_companies::text AS "currentHiringCompanies",
        demand.baseline_hiring_companies::text AS "baselineHiringCompanies"
      FROM latest
      JOIN job_market_daily_metrics metric
        ON metric.sample_date = latest.sample_date
      JOIN job_market_pillars pillar ON pillar.id = metric.pillar_id
      LEFT JOIN windows ON windows.pillar_id = metric.pillar_id
      LEFT JOIN demand_windows demand ON demand.pillar_id = metric.pillar_id
      WHERE pillar.kind IN ('market', 'classifications')
      ORDER BY pillar.kind, metric.active_jobs DESC, pillar.label
    `);
  }

  getGeography(
    dimensionSlug: string,
    range: "90" | "365" | "max",
  ): Promise<JobMarketGeographyRow[]> {
    return this.postgres.query<JobMarketGeographyRow>(
      `
        WITH latest AS (
          SELECT max(as_of_date) AS as_of_date
          FROM job_market_geography_metrics
        )
        SELECT metric.as_of_date::text AS "asOfDate",
          metric.range_key AS "rangeKey",
          metric.dimension_kind AS "dimensionKind",
          metric.dimension_slug AS "dimensionSlug",
          metric.region_key AS "regionKey",
          metric.region_slug AS "regionSlug",
          metric.region_label AS "regionLabel",
          metric.region_type AS "regionType",
          metric.filter_key AS "filterKey",
          metric.filter_value AS "filterValue",
          metric.country_code AS "countryCode",
          metric.segment,
          metric.salary_median_monthly_usd::text
            AS "salaryMedianMonthlyUsd",
          metric.salary_p25_monthly_usd::text AS "salaryP25MonthlyUsd",
          metric.salary_p75_monthly_usd::text AS "salaryP75MonthlyUsd",
          metric.adjusted_premium_percent::text
            AS "adjustedPremiumPercent",
          metric.salary_sample_count::text AS "salarySampleCount",
          metric.employer_count::text AS "employerCount",
          metric.onsite_count::text AS "onsiteCount",
          metric.hybrid_count::text AS "hybridCount",
          metric.remote_count::text AS "remoteCount",
          metric.active_job_count::text AS "regionalActiveJobs",
          metric.hiring_company_count::text
            AS "regionalHiringCompanies",
          metric.active_onsite_count::text
            AS "regionalActiveOnsiteJobs",
          metric.active_hybrid_count::text
            AS "regionalActiveHybridJobs",
          metric.active_remote_count::text
            AS "regionalActiveRemoteJobs"
        FROM job_market_geography_metrics metric
        JOIN latest ON latest.as_of_date = metric.as_of_date
        WHERE metric.dimension_slug = $1
          AND metric.range_key = $2
        ORDER BY
          CASE metric.region_slug
            WHEN 'remote' THEN 0 WHEN 'local' THEN 1 ELSE 2
          END,
          metric.region_label
      `,
      [dimensionSlug, range],
    );
  }

  getClassificationCompensationBands(
    classificationSlug: string,
    range: "90" | "365" | "max",
  ): Promise<JobMarketCompensationBandRow[]> {
    return this.postgres.query<JobMarketCompensationBandRow>(
      `
        WITH latest AS (
          SELECT max(observed_date) AS observed_date
          FROM job_market_salary_observations
        ), filtered AS MATERIALIZED (
          SELECT observation.*,
            CASE
              WHEN document.organization_id IS NOT NULL
                AND document.project_id IS NULL
                THEN 'organization:' || document.organization_id
              WHEN document.organization_id IS NULL
                AND document.project_id IS NOT NULL
                THEN 'project:' || document.project_id
            END AS current_employer_key,
            CASE COALESCE(observation.seniority, '')
              WHEN '1' THEN 's-intern'
              WHEN '2' THEN 's-junior'
              WHEN '3' THEN 's-senior'
              WHEN '4' THEN 's-lead'
              WHEN '5' THEN 's-head'
              ELSE 's-' || slugify_text(observation.seniority)
            END AS seniority_slug,
            CASE COALESCE(observation.seniority, '')
              WHEN '1' THEN 'Intern'
              WHEN '2' THEN 'Junior'
              WHEN '3' THEN 'Senior'
              WHEN '4' THEN 'Lead'
              WHEN '5' THEN 'Head'
              ELSE initcap(replace(observation.seniority, '_', ' '))
            END AS seniority_label
          FROM job_market_salary_observations observation
          JOIN job_search_documents document
            ON document.job_node_id = observation.job_node_id
          CROSS JOIN latest
          WHERE observation.continent_slug = 'all'
            AND observation.seniority IS NOT NULL
            AND observation.seniority <> ''
            AND num_nonnulls(
              document.organization_id,
              document.project_id
            ) = 1
            AND ($1 = 'market' OR observation.classification_slug = $1)
            AND (
              $2 = 'max'
              OR observation.observed_date >= latest.observed_date
                - CASE $2 WHEN '90' THEN 89 ELSE 364 END
            )
        ), employer_counts AS (
          SELECT segment, seniority_slug, current_employer_key, count(*) AS jobs
          FROM filtered
          WHERE current_employer_key IS NOT NULL
          GROUP BY segment, seniority_slug, current_employer_key
        ), concentration AS (
          SELECT segment, seniority_slug,
            max(jobs)::numeric / nullif(sum(jobs), 0) AS max_employer_share
          FROM employer_counts
          GROUP BY segment, seniority_slug
        )
        SELECT filtered.segment AS segment,
          filtered.seniority_slug AS "senioritySlug",
          min(filtered.seniority_label) AS "seniorityLabel",
          percentile_cont(0.5) WITHIN GROUP (
            ORDER BY filtered.salary_monthly_usd
          )::text AS "salaryMedianMonthlyUsd",
          percentile_cont(0.25) WITHIN GROUP (
            ORDER BY filtered.salary_monthly_usd
          )::text AS "salaryP25MonthlyUsd",
          percentile_cont(0.75) WITHIN GROUP (
            ORDER BY filtered.salary_monthly_usd
          )::text AS "salaryP75MonthlyUsd",
          count(DISTINCT filtered.job_node_id)::text AS "salarySampleCount",
          count(DISTINCT filtered.current_employer_key)
            FILTER (WHERE filtered.current_employer_key IS NOT NULL)::text
            AS "employerCount",
          concentration.max_employer_share::text AS "maxEmployerShare",
          count(DISTINCT date_trunc('month', filtered.observed_date))::text
            AS "observedMonthCount"
        FROM filtered
        LEFT JOIN concentration USING (segment, seniority_slug)
        GROUP BY filtered.segment, filtered.seniority_slug,
          concentration.max_employer_share
        ORDER BY CASE filtered.seniority_slug
          WHEN 's-intern' THEN 1 WHEN 's-junior' THEN 2
          WHEN 's-senior' THEN 3 WHEN 's-lead' THEN 4
          WHEN 's-head' THEN 5 ELSE 6 END, filtered.segment
      `,
      [classificationSlug, range],
    );
  }

  getTopPayingJobs(
    classificationSlug: string,
    segment: "remote" | "local",
    regionKey: string | null,
    filterKey: JobMarketGeographyRow["filterKey"],
    filterValue: string | null,
  ): Promise<JobMarketTopPayingRow[]> {
    return this.postgres.query<JobMarketTopPayingRow>(
      `
        WITH latest AS (
          SELECT max(sample_date) AS as_of_date
          FROM job_market_daily_metrics
        ), eligible AS MATERIALIZED (
          SELECT observation.job_node_id, observation.salary_monthly_usd,
            observation.classification_slug, observation.seniority,
            observation.onsite, observation.hybrid, observation.remote,
            document.short_uuid, document.title, document.location,
            document.location_types, document.published_at,
            COALESCE(
              organization.name,
              project.name,
              document.payload #>> '{organization,name}',
              document.payload #>> '{project,name}'
            ) AS organization_name,
            COALESCE(
              organization.payload ->> 'logoUrl',
              project.payload ->> 'logoUrl',
              document.payload #>> '{organization,logoUrl}',
              document.payload #>> '{project,logoUrl}'
            ) AS organization_logo_url,
            COALESCE(classification.label, observation.classification_slug)
              AS classification_label,
            COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object('slug', tag.slug, 'label', tag.label)
                ORDER BY tag.label
              )
              FROM (
                SELECT DISTINCT membership.slug, membership.label
                FROM job_market_job_pillars membership
                WHERE membership.job_node_id = observation.job_node_id
                  AND membership.kind = 'tags'
              ) tag
            ), '[]'::jsonb) AS tags
          FROM job_market_salary_observations observation
          INNER JOIN job_search_documents document
            ON document.job_node_id = observation.job_node_id
          LEFT JOIN organization_search_documents organization
            ON organization.organization_id = document.organization_id
           AND document.project_id IS NULL
          LEFT JOIN project_search_documents project
            ON project.project_id = document.project_id
           AND document.organization_id IS NULL
          LEFT JOIN LATERAL (
            SELECT min(membership.label) AS label
            FROM job_market_job_pillars membership
            WHERE membership.job_node_id = observation.job_node_id
              AND membership.kind = 'classifications'
              AND membership.slug = observation.classification_slug
          ) classification ON true
          WHERE observation.segment = $2
            AND observation.continent_slug = 'all'
            AND ($1 = 'market'
              OR observation.classification_slug = $1)
            AND document.online
            AND NOT document.blocked
            AND document.legacy_list_eligible
            AND cardinality(document.tags) > 0
            AND document.short_uuid IS NOT NULL
            AND num_nonnulls(
              document.organization_id,
              document.project_id
            ) = 1
            AND NOT (document.access = 'public'
              AND document.organization_has_expert_jobs)
            AND (
              document.minimum_salary IS NULL
              OR document.maximum_salary IS NULL
              OR abs(
                document.maximum_salary - document.minimum_salary
              ) * observation.salary_monthly_usd * 12
                / NULLIF(document.salary, 0) <= $6::numeric
            )
            AND NOT EXISTS (
              SELECT 1 FROM graph_nodes banned_employer
              WHERE (
                (
                    banned_employer.label = 'Organization'
                    AND banned_employer.properties ->> 'orgId' =
                      document.organization_id
                  ) OR (
                    banned_employer.label = 'Project'
                    AND banned_employer.properties ->> 'id' =
                      document.project_id
                  )
                )
                AND entity_property_is_banned(
                  banned_employer.properties
                )
            )
            AND (
              $3::text IS NULL
              OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements(
                  COALESCE(document.payload -> 'availability', '[]'::jsonb)
                ) item
                JOIN place_reference place
                  ON place.place_id = regexp_replace(
                    COALESCE(item ->> 'placeId', ''), '^place:', ''
                  )
                JOIN place_reference target
                  ON target.place_id = place.place_id
                  OR target.place_id = ANY(place.ancestor_place_ids)
                WHERE COALESCE(item ->> 'workMode', 'local') IN (
                  'local', 'onsite', 'hybrid'
                )
                  AND target.place_id = regexp_replace($3, '^place:', '')
              )
              OR (
                NOT EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(
                    COALESCE(
                      document.payload -> 'availability',
                      '[]'::jsonb
                    )
                  ) item
                  JOIN place_reference place
                    ON place.place_id = regexp_replace(
                      COALESCE(item ->> 'placeId', ''), '^place:', ''
                    )
                  WHERE COALESCE(item ->> 'workMode', 'local') IN (
                    'local', 'onsite', 'hybrid'
                  )
                )
                AND (
                  document.availability_keys && ARRAY[$5]::text[]
                  OR EXISTS (
                    SELECT 1
                    FROM jsonb_each_text(
                      COALESCE(document.filter_labels -> $4, '{}'::jsonb)
                    ) geography(internal_key, public_label)
                    WHERE geography.internal_key = $5
                       OR slugify_text(geography.public_label) = $5
                  )
                )
              )
            )
        ), statistics AS (
          SELECT count(*)::int AS salary_job_count,
            percentile_cont(0.9) WITHIN GROUP (
              ORDER BY salary_monthly_usd
            ) AS top_decile_threshold
          FROM eligible
        ), top_decile AS MATERIALIZED (
          SELECT eligible.*
          FROM eligible
          CROSS JOIN statistics
          WHERE eligible.salary_monthly_usd >=
            statistics.top_decile_threshold
        )
        SELECT latest.as_of_date::text AS "asOfDate",
          statistics.salary_job_count::text AS "salaryJobCount",
          statistics.top_decile_threshold::text
            AS "topDecileThresholdMonthlyUsd",
          (count(*) OVER ())::text AS "topDecileJobCount",
          top_decile.job_node_id::text AS "jobNodeId",
          top_decile.short_uuid AS "shortUuid",
          top_decile.title,
          top_decile.organization_name AS "organizationName",
          top_decile.organization_logo_url AS "organizationLogoUrl",
          top_decile.classification_slug AS "classificationSlug",
          top_decile.classification_label AS "classificationLabel",
          top_decile.seniority,
          top_decile.location,
          top_decile.location_types AS "locationTypes",
          top_decile.onsite, top_decile.hybrid, top_decile.remote,
          top_decile.published_at::text AS "publishedAt",
          top_decile.salary_monthly_usd::text AS "salaryMonthlyUsd",
          top_decile.tags
        FROM top_decile
        CROSS JOIN statistics
        CROSS JOIN latest
        ORDER BY top_decile.salary_monthly_usd DESC,
          top_decile.job_node_id
      `,
      [
        classificationSlug,
        segment,
        regionKey,
        filterKey,
        filterValue,
        MAX_ANNUAL_SALARY_RANGE_USD,
      ],
    );
  }

  getClassificationSkillSummaries(
    classificationSlug: string,
    segment: "remote" | "local",
    query: string,
  ): Promise<JobMarketSkillRow[]> {
    const remote = segment === "remote";
    return this.postgres.query<JobMarketSkillRow>(
      `
        WITH latest AS (
          SELECT max(sample_date) AS as_of_date
          FROM job_market_daily_metrics
        ), eligible_jobs AS MATERIALIZED (
          SELECT document.job_node_id,
            CASE
              WHEN document.organization_id IS NOT NULL
                AND document.project_id IS NULL
                THEN 'organization:' || document.organization_id
              WHEN document.organization_id IS NULL
                AND document.project_id IS NOT NULL
                THEN 'project:' || document.project_id
            END AS employer_key,
            COALESCE(
              CASE
                WHEN jsonb_boolean_value(
                  document.payload, 'publishedTimestampIsVerified'
                ) THEN document.published_at::date
                ELSE NULL
              END,
              to_timestamp(jsonb_numeric_value(
                document.payload, 'firstSeenTimestamp'
              )::double precision / 1000)::date,
              document.published_at::date
            ) AS observed_date,
            job_has_work_location_mode(document.job_node_id, 'remote')
              AS has_remote,
            job_has_work_location_mode(document.job_node_id, 'onsite')
              AS has_onsite,
            job_has_work_location_mode(document.job_node_id, 'hybrid')
              AS has_hybrid
          FROM job_search_documents document
          INNER JOIN job_market_job_pillars classification
            ON classification.job_node_id = document.job_node_id
           AND classification.kind = 'classifications'
           AND classification.slug = $1
          WHERE document.online
            AND NOT document.blocked
            AND document.legacy_list_eligible
            AND cardinality(document.tags) > 0
            AND num_nonnulls(
              document.organization_id,
              document.project_id
            ) = 1
            AND NOT (document.access = 'public'
              AND document.organization_has_expert_jobs)
            AND NOT EXISTS (
              SELECT 1 FROM graph_nodes employer
              WHERE (
                (
                    employer.label = 'Organization'
                    AND employer.properties ->> 'orgId' =
                      document.organization_id
                  ) OR (
                    employer.label = 'Project'
                    AND employer.properties ->> 'id' = document.project_id
                  )
                )
                AND entity_property_is_banned(employer.properties)
            )
        ), segment_jobs AS MATERIALIZED (
          SELECT * FROM eligible_jobs
          WHERE CASE WHEN $2::boolean THEN has_remote
            ELSE has_onsite OR has_hybrid END
        ), classification_total AS (
          SELECT count(DISTINCT job_node_id)::numeric AS jobs
          FROM segment_jobs
        ), open_stats AS MATERIALIZED (
          SELECT tag.slug, min(tag.label) AS label,
            count(DISTINCT job.job_node_id)::int AS active_jobs,
            count(DISTINCT job.employer_key)
              FILTER (WHERE job.employer_key IS NOT NULL)::int
              AS hiring_companies,
            count(DISTINCT job.job_node_id) FILTER (
              WHERE job.observed_date > latest.as_of_date - 7
            )::int AS current_window_jobs,
            count(DISTINCT job.job_node_id) FILTER (
              WHERE job.observed_date > latest.as_of_date - 14
                AND job.observed_date <= latest.as_of_date - 7
            )::int AS previous_window_jobs,
            count(DISTINCT job.job_node_id) FILTER (WHERE job.has_onsite)::int
              AS active_onsite_jobs,
            count(DISTINCT job.job_node_id) FILTER (WHERE job.has_hybrid)::int
              AS active_hybrid_jobs,
            count(DISTINCT job.job_node_id) FILTER (WHERE job.has_remote)::int
              AS active_remote_jobs
          FROM segment_jobs job
          CROSS JOIN latest
          INNER JOIN job_market_job_pillars tag
            ON tag.job_node_id = job.job_node_id AND tag.kind = 'tags'
          GROUP BY tag.slug
        ), salary_base AS MATERIALIZED (
          SELECT observation.*, pillar.slug, pillar.label,
            CASE
              WHEN document.organization_id IS NOT NULL
                AND document.project_id IS NULL
                THEN 'organization:' || document.organization_id
              WHEN document.organization_id IS NULL
                AND document.project_id IS NOT NULL
                THEN 'project:' || document.project_id
            END AS current_employer_key
          FROM job_market_salary_observations observation
          JOIN job_search_documents document
            ON document.job_node_id = observation.job_node_id
          INNER JOIN job_market_salary_observation_pillars mapping
            ON mapping.job_node_id = observation.job_node_id
           AND mapping.segment = observation.segment
           AND mapping.continent_slug = observation.continent_slug
          INNER JOIN job_market_pillars pillar
            ON pillar.id = mapping.pillar_id AND pillar.kind = 'tags'
          WHERE observation.classification_slug = $1
            AND observation.segment = $3
            AND observation.continent_slug = 'all'
            AND num_nonnulls(
              document.organization_id,
              document.project_id
            ) = 1
        ), employer_counts AS (
          SELECT slug, current_employer_key, count(*) AS jobs
          FROM salary_base
          WHERE current_employer_key IS NOT NULL
          GROUP BY slug, current_employer_key
        ), salary_stats AS (
          SELECT salary.slug, min(salary.label) AS label,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY salary.salary_monthly_usd
            ) AS median_salary,
            percentile_cont(0.25) WITHIN GROUP (
              ORDER BY salary.salary_monthly_usd
            ) AS p25_salary,
            percentile_cont(0.75) WITHIN GROUP (
              ORDER BY salary.salary_monthly_usd
            ) AS p75_salary,
            100 * (exp(percentile_cont(0.5) WITHIN GROUP (
              ORDER BY salary.adjusted_log_premium
            )) - 1) AS adjusted_premium,
            count(DISTINCT salary.job_node_id)::int AS salary_jobs,
            count(DISTINCT salary.current_employer_key)
              FILTER (WHERE salary.current_employer_key IS NOT NULL)::int
              AS salary_employers,
            count(DISTINCT date_trunc('month', salary.observed_date))::int
              AS observed_months,
            count(DISTINCT salary.job_node_id) FILTER (WHERE salary.onsite)::int
              AS onsite_count,
            count(DISTINCT salary.job_node_id) FILTER (WHERE salary.hybrid)::int
              AS hybrid_count,
            count(DISTINCT salary.job_node_id) FILTER (WHERE salary.remote)::int
              AS remote_count
          FROM salary_base salary
          GROUP BY salary.slug
        ), concentration AS (
          SELECT slug, max(jobs)::numeric / nullif(sum(jobs), 0)
            AS max_employer_share
          FROM employer_counts
          GROUP BY slug
        )
        SELECT latest.as_of_date::text AS "asOfDate",
          '90' AS "rangeKey", 'tags' AS "dimensionKind",
          open.slug AS "dimensionSlug", open.label,
          $3 AS segment,
          CASE WHEN $2::boolean THEN 'remote' ELSE 'local' END AS "regionSlug",
          CASE WHEN $2::boolean THEN 'Remote' ELSE 'All local markets' END
            AS "regionLabel",
          CASE WHEN $2::boolean THEN 'remote' ELSE 'aggregate' END
            AS "regionType",
          NULL::text AS "countryCode",
          salary.median_salary::text AS "salaryMedianMonthlyUsd",
          salary.p25_salary::text AS "salaryP25MonthlyUsd",
          salary.p75_salary::text AS "salaryP75MonthlyUsd",
          salary.adjusted_premium::text AS "adjustedPremiumPercent",
          COALESCE(salary.salary_jobs, 0)::text AS "salarySampleCount",
          COALESCE(salary.salary_employers, 0)::text AS "employerCount",
          COALESCE(salary.onsite_count, 0)::text AS "onsiteCount",
          COALESCE(salary.hybrid_count, 0)::text AS "hybridCount",
          COALESCE(salary.remote_count, 0)::text AS "remoteCount",
          open.active_jobs::text AS "regionalActiveJobs",
          open.hiring_companies::text AS "regionalHiringCompanies",
          open.active_onsite_jobs::text AS "regionalActiveOnsiteJobs",
          open.active_hybrid_jobs::text AS "regionalActiveHybridJobs",
          open.active_remote_jobs::text AS "regionalActiveRemoteJobs",
          concentration.max_employer_share::text AS "maxEmployerShare",
          COALESCE(salary.observed_months, 0)::text AS "observedMonthCount",
          open.active_jobs::text AS "activeJobs",
          open.hiring_companies::text AS "hiringCompanies",
          open.current_window_jobs::text AS "currentWindowJobs",
          open.previous_window_jobs::text AS "previousWindowJobs",
          NULL::text AS "currentActiveJobs",
          NULL::text AS "baselineActiveJobs",
          NULL::text AS "currentHiringCompanies",
          NULL::text AS "baselineHiringCompanies",
          round(100 * open.active_jobs / nullif(total.jobs, 0), 1)::text
            AS "openJobShare",
          NULL::text AS "signalAsOf", NULL::text AS "signalStatus",
          NULL::text AS "currentMedianMonthlyUsd",
          NULL::text AS "baselineMedianMonthlyUsd",
          NULL::text AS "rawChangePercent",
          NULL::text AS "adjustedChangePercent",
          NULL::text AS "confidenceLowPercent",
          NULL::text AS "confidenceHighPercent", NULL::text AS "qValue",
          NULL::text AS "recentJobCount", NULL::text AS "baselineJobCount",
          NULL::text AS "recentEmployerCount",
          NULL::text AS "baselineEmployerCount", NULL::text AS "signalSince"
        FROM open_stats open
        CROSS JOIN latest
        CROSS JOIN classification_total total
        LEFT JOIN salary_stats salary USING (slug)
        LEFT JOIN concentration USING (slug)
        WHERE open.active_jobs >= 10
          AND open.hiring_companies >= 5
          AND open.slug <> replace($1, 'cl-', 't-')
          AND ($4 = '' OR open.label ILIKE '%' || $4 || '%'
            OR open.slug ILIKE '%' || slugify_text($4) || '%')
        ORDER BY open.active_jobs DESC, open.hiring_companies DESC, open.label
        LIMIT 500
      `,
      [classificationSlug, remote, segment, query],
    );
  }

  getSkillSummaries(
    segment: "remote" | "local",
    query: string,
  ): Promise<JobMarketSkillRow[]> {
    const region = segment === "remote" ? "remote" : "local";
    return this.postgres.query<JobMarketSkillRow>(
      `
        WITH latest_geo AS (
          SELECT max(as_of_date) AS as_of_date
          FROM job_market_geography_metrics
        ), latest_market AS (
          SELECT max(sample_date) AS sample_date
          FROM job_market_daily_metrics
        ), eligible_geography AS MATERIALIZED (
          SELECT geography.*, pillar.id AS pillar_id, pillar.label
          FROM job_market_geography_metrics geography
          JOIN latest_geo ON latest_geo.as_of_date = geography.as_of_date
          JOIN job_market_pillars pillar
            ON pillar.slug = geography.dimension_slug
           AND pillar.kind = 'tags'
          WHERE geography.dimension_kind = 'tags'
            AND geography.range_key = '90'
            AND geography.segment = $1
            AND geography.region_slug = $2
            AND geography.salary_sample_count >= 5
            AND geography.employer_count >= 3
            AND ($3 = '' OR pillar.label ILIKE '%' || $3 || '%'
              OR pillar.slug ILIKE '%' || slugify_text($3) || '%')
        ), demand AS (
          SELECT metric.pillar_id,
            COALESCE(sum(metric.new_jobs) FILTER (
              WHERE metric.sample_date > latest.sample_date - 7
            ), 0)::int AS current_window_jobs,
            COALESCE(sum(metric.new_jobs) FILTER (
              WHERE metric.sample_date > latest.sample_date - 14
                AND metric.sample_date <= latest.sample_date - 7
            ), 0)::int AS previous_window_jobs,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY metric.active_jobs
            ) FILTER (
              WHERE metric.sample_date > latest.sample_date - 7
            ) AS current_active_jobs,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY metric.active_jobs
            ) FILTER (
              WHERE metric.sample_date > latest.sample_date - 35
                AND metric.sample_date <= latest.sample_date - 7
            ) AS baseline_active_jobs,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY metric.hiring_companies
            ) FILTER (
              WHERE metric.sample_date > latest.sample_date - 7
            ) AS current_hiring_companies,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY metric.hiring_companies
            ) FILTER (
              WHERE metric.sample_date > latest.sample_date - 35
                AND metric.sample_date <= latest.sample_date - 7
            ) AS baseline_hiring_companies
          FROM job_market_daily_metrics metric
          INNER JOIN eligible_geography geography
            ON geography.pillar_id = metric.pillar_id
          CROSS JOIN latest_market latest
          WHERE metric.sample_date > latest.sample_date - 35
          GROUP BY metric.pillar_id
        ), latest_signal AS (
          SELECT DISTINCT ON (signal.pillar_id, signal.segment)
            signal.*
          FROM job_market_skill_signal_history signal
          ORDER BY signal.pillar_id, signal.segment, signal.as_of_date DESC
        )
        SELECT geography.as_of_date::text AS "asOfDate",
          geography.range_key AS "rangeKey",
          geography.dimension_kind AS "dimensionKind",
          geography.dimension_slug AS "dimensionSlug",
          geography.region_key AS "regionKey",
          geography.region_slug AS "regionSlug",
          geography.region_label AS "regionLabel",
          geography.region_type AS "regionType",
          geography.filter_key AS "filterKey",
          geography.filter_value AS "filterValue",
          geography.country_code AS "countryCode",
          geography.segment, geography.label,
          geography.salary_median_monthly_usd::text
            AS "salaryMedianMonthlyUsd",
          geography.salary_p25_monthly_usd::text AS "salaryP25MonthlyUsd",
          geography.salary_p75_monthly_usd::text AS "salaryP75MonthlyUsd",
          geography.adjusted_premium_percent::text
            AS "adjustedPremiumPercent",
          geography.salary_sample_count::text AS "salarySampleCount",
          geography.employer_count::text AS "employerCount",
          geography.onsite_count::text AS "onsiteCount",
          geography.hybrid_count::text AS "hybridCount",
          geography.remote_count::text AS "remoteCount",
          geography.active_job_count::text AS "regionalActiveJobs",
          geography.hiring_company_count::text
            AS "regionalHiringCompanies",
          geography.active_onsite_count::text
            AS "regionalActiveOnsiteJobs",
          geography.active_hybrid_count::text
            AS "regionalActiveHybridJobs",
          geography.active_remote_count::text
            AS "regionalActiveRemoteJobs",
          COALESCE(current_metric.active_jobs, 0)::text AS "activeJobs",
          COALESCE(current_metric.hiring_companies, 0)::text
            AS "hiringCompanies",
          COALESCE(demand.current_window_jobs, 0)::text
            AS "currentWindowJobs",
          COALESCE(demand.previous_window_jobs, 0)::text
            AS "previousWindowJobs",
          demand.current_active_jobs::text AS "currentActiveJobs",
          demand.baseline_active_jobs::text AS "baselineActiveJobs",
          demand.current_hiring_companies::text AS "currentHiringCompanies",
          demand.baseline_hiring_companies::text
            AS "baselineHiringCompanies",
          signal.as_of_date::text AS "signalAsOf",
          signal.status AS "signalStatus",
          signal.current_median_monthly_usd::text
            AS "currentMedianMonthlyUsd",
          signal.baseline_median_monthly_usd::text
            AS "baselineMedianMonthlyUsd",
          signal.raw_change_percent::text AS "rawChangePercent",
          signal.adjusted_change_percent::text AS "adjustedChangePercent",
          signal.confidence_low_percent::text AS "confidenceLowPercent",
          signal.confidence_high_percent::text AS "confidenceHighPercent",
          signal.q_value::text AS "qValue",
          signal.recent_job_count::text AS "recentJobCount",
          signal.baseline_job_count::text AS "baselineJobCount",
          signal.recent_employer_count::text AS "recentEmployerCount",
          signal.baseline_employer_count::text AS "baselineEmployerCount",
          signal.signal_since::text AS "signalSince"
        FROM eligible_geography geography
        LEFT JOIN job_market_daily_metrics current_metric
          ON current_metric.pillar_id = geography.pillar_id
         AND current_metric.sample_date = (
           SELECT sample_date FROM latest_market
         )
        LEFT JOIN demand ON demand.pillar_id = geography.pillar_id
        LEFT JOIN latest_signal signal
          ON signal.pillar_id = geography.pillar_id
         AND signal.segment = geography.segment
        ORDER BY geography.salary_sample_count DESC, geography.label
        LIMIT 2000
      `,
      [segment, region, query],
    );
  }

  getSkillWeeklyHistory(
    slug: string,
    days: number | null,
  ): Promise<JobMarketSkillWeeklyRow[]> {
    return this.postgres.query<JobMarketSkillWeeklyRow>(
      `
        WITH target AS (
          SELECT id, slug, label FROM job_market_pillars
          WHERE slug = $1 AND kind = 'tags'
        ), latest AS (
          SELECT max(week_start) AS week_start
          FROM job_market_skill_weekly_metrics metric
          JOIN target ON target.id = metric.pillar_id
        )
        SELECT metric.week_start::text AS "weekStart",
          target.slug, target.label, metric.segment,
          metric.continent_slug AS "regionSlug",
          metric.continent_label AS "regionLabel",
          metric.salary_median_monthly_usd::text
            AS "salaryMedianMonthlyUsd",
          metric.salary_p25_monthly_usd::text AS "salaryP25MonthlyUsd",
          metric.salary_p75_monthly_usd::text AS "salaryP75MonthlyUsd",
          metric.adjusted_premium_percent::text
            AS "adjustedPremiumPercent",
          metric.salary_sample_count::text AS "salarySampleCount",
          metric.employer_count::text AS "employerCount",
          metric.onsite_count::text AS "onsiteCount",
          metric.hybrid_count::text AS "hybridCount",
          metric.remote_count::text AS "remoteCount"
        FROM job_market_skill_weekly_metrics metric
        JOIN target ON target.id = metric.pillar_id
        CROSS JOIN latest
        WHERE $2::int IS NULL
           OR metric.week_start >= latest.week_start - ($2::int - 1)
        ORDER BY metric.week_start, metric.segment, metric.continent_slug
      `,
      [slug, days],
    );
  }

  getLatestSkillSignals(slug: string): Promise<JobMarketSkillRow[]> {
    return this.postgres.query<JobMarketSkillRow>(
      `
        WITH target AS (
          SELECT id, slug, label FROM job_market_pillars
          WHERE slug = $1 AND kind = 'tags'
        ), latest AS (
          SELECT max(as_of_date) AS as_of_date
          FROM job_market_skill_signal_history signal
          JOIN target ON target.id = signal.pillar_id
        )
        SELECT signal.as_of_date::text AS "signalAsOf",
          signal.segment, target.slug AS "dimensionSlug", target.label,
          signal.status AS "signalStatus",
          signal.current_median_monthly_usd::text
            AS "currentMedianMonthlyUsd",
          signal.baseline_median_monthly_usd::text
            AS "baselineMedianMonthlyUsd",
          signal.raw_change_percent::text AS "rawChangePercent",
          signal.adjusted_change_percent::text AS "adjustedChangePercent",
          signal.confidence_low_percent::text AS "confidenceLowPercent",
          signal.confidence_high_percent::text AS "confidenceHighPercent",
          signal.q_value::text AS "qValue",
          signal.recent_job_count::text AS "recentJobCount",
          signal.baseline_job_count::text AS "baselineJobCount",
          signal.recent_employer_count::text AS "recentEmployerCount",
          signal.baseline_employer_count::text AS "baselineEmployerCount",
          signal.signal_since::text AS "signalSince"
        FROM job_market_skill_signal_history signal
        JOIN target ON target.id = signal.pillar_id
        JOIN latest ON latest.as_of_date = signal.as_of_date
        ORDER BY signal.segment
      `,
      [slug],
    );
  }
}
