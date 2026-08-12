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
          AS "previousWindowJobs"
      FROM latest
      JOIN job_market_daily_metrics metric
        ON metric.sample_date = latest.sample_date
      JOIN job_market_pillars pillar ON pillar.id = metric.pillar_id
      LEFT JOIN windows ON windows.pillar_id = metric.pillar_id
      WHERE pillar.kind IN ('market', 'classifications')
      ORDER BY pillar.kind, metric.active_jobs DESC, pillar.label
    `);
  }
}
