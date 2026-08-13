import { Injectable } from "@nestjs/common";
import { PostgresService } from "./postgres.service";

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
  regionSlug: string;
  regionLabel: string;
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

@Injectable()
export class JobMarketRepository {
  constructor(private readonly postgres: PostgresService) {}

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
          metric.region_slug AS "regionSlug",
          metric.region_label AS "regionLabel",
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
          metric.remote_count::text AS "remoteCount"
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
          geography.region_slug AS "regionSlug",
          geography.region_label AS "regionLabel",
          geography.segment, pillar.label,
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
        FROM job_market_geography_metrics geography
        JOIN latest_geo ON latest_geo.as_of_date = geography.as_of_date
        JOIN job_market_pillars pillar
          ON pillar.slug = geography.dimension_slug
         AND pillar.kind = 'tags'
        LEFT JOIN job_market_daily_metrics current_metric
          ON current_metric.pillar_id = pillar.id
         AND current_metric.sample_date = (
           SELECT sample_date FROM latest_market
         )
        LEFT JOIN demand ON demand.pillar_id = pillar.id
        LEFT JOIN latest_signal signal
          ON signal.pillar_id = pillar.id
         AND signal.segment = geography.segment
        WHERE geography.dimension_kind = 'tags'
          AND geography.range_key = '90'
          AND geography.segment = $1
          AND geography.region_slug = $2
          AND geography.salary_sample_count >= 5
          AND geography.employer_count >= 3
          AND ($3 = '' OR pillar.label ILIKE '%' || $3 || '%'
            OR pillar.slug ILIKE '%' || slugify_text($3) || '%')
        ORDER BY geography.salary_sample_count DESC, pillar.label
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
