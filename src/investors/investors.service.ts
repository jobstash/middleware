import { BadRequestException, Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Investor, PaginatedData } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { paginate } from "src/shared/helpers";
import { sort } from "fast-sort";
import { GraphRepository } from "src/postgres/graph.repository";
import { PostgresService } from "src/postgres/postgres.service";
import {
  FundActivityWindow,
  FundListOrderBy,
  InvestorListParams,
} from "./dto/investor-list.input";

const DAY_SECONDS = 86_400;
const FUND_ROUND_STAGES = new Set([
  "pre-seed",
  "seed",
  "series-a",
  "series-b",
  "series-c",
  "series-d",
  "series-e",
  "series-f-plus",
  "pre-ipo",
  "public-markets",
  "token-sale",
  "strategic",
  "private",
  "debt",
  "secondary",
  "corporate",
  "venture",
  "equity",
  "unknown",
]);

interface FundActivityRange {
  window: FundActivityWindow;
  from: number;
  toExclusive: number;
  responseFrom: number | null;
  responseTo: number;
}

const parseUtcDate = (value: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const timestamp = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    return null;
  }
  return Math.trunc(timestamp / 1000);
};

const resolveFundActivityRange = (
  params: InvestorListParams,
): FundActivityRange => {
  const window = params.activityWindow ?? "1y";
  const now = new Date();
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const todaySeconds = Math.trunc(today / 1000);
  const toExclusive = todaySeconds + DAY_SECONDS;
  let from = todaySeconds;
  let resolvedTo = toExclusive;

  if (window === "custom") {
    if (!params.fromDate || !params.toDate) {
      throw new BadRequestException(
        "fromDate and toDate are required for a custom activity window",
      );
    }
    const customFrom = parseUtcDate(params.fromDate);
    const customTo = parseUtcDate(params.toDate);
    if (customFrom === null || customTo === null || customFrom > customTo) {
      throw new BadRequestException("Invalid fund activity date range");
    }
    from = customFrom;
    resolvedTo = customTo + DAY_SECONDS;
  } else if (window === "all") {
    from = 0;
  } else if (window === "30d" || window === "90d") {
    const days = window === "30d" ? 30 : 90;
    from = todaySeconds - (days - 1) * DAY_SECONDS;
  } else {
    const start = new Date(today);
    if (window === "6m") start.setUTCMonth(start.getUTCMonth() - 6);
    if (window === "1y") start.setUTCFullYear(start.getUTCFullYear() - 1);
    if (window === "2y") start.setUTCFullYear(start.getUTCFullYear() - 2);
    if (window === "5y") start.setUTCFullYear(start.getUTCFullYear() - 5);
    from = Math.trunc(start.getTime() / 1000);
  }

  return {
    window,
    from,
    toExclusive: resolvedTo,
    responseFrom: window === "all" ? null : from,
    responseTo: resolvedTo - 1,
  };
};

const resolveFundRoundStages = (
  rounds: string | null | undefined,
): string[] | null => {
  const stages = [
    ...new Set(
      (rounds ?? "")
        .split(",")
        .map(stage => stage.trim().toLowerCase())
        .filter(stage => FUND_ROUND_STAGES.has(stage)),
    ),
  ];
  return stages.length > 0 ? stages : null;
};

export interface FundListItem {
  id: string;
  name: string;
  normalizedName: string;
  logoUrl: string | null;
  website: string | null;
  twitter: string | null;
  staffCount: number;
  socialStaffCount: number;
  portfolioCount: number;
  totalInvestedCapital: number | null;
  knownRoundCapital: number | null;
  knownRoundCount: number;
  valuationRoundCount: number;
  investmentRoundCount: number;
  ambiguousRoundCount: number;
  soloRoundCount: number;
  syndicatedRoundCount: number;
  soloRate: number | null;
  progressedCompanyCount: number;
  progressionRate: number | null;
  stageProgressedCompanyCount: number;
  stageTrackedCompanyCount: number;
  stageProgressionRate: number | null;
  followOnRoundCapital: number | null;
  medianRoundSizeStepUp: number | null;
  roundSizeStepUpSample: number;
  medianValuationStepUp: number | null;
  valuationStepUpSample: number;
  topSectors: FundSector[];
  lastInvestmentDate: number | null;
  jobCount: number;
  activityWindow: FundActivityWindow;
  activityFromDate: number | null;
  activityToDate: number;
  roundStages: string[];
}

export interface FundSector {
  name: string;
  companyCount: number;
}

export interface FundRoundStage {
  slug: string;
  name: string;
  fundCount: number;
  investmentCount: number;
}

export type EvSitemapFund = {
  normalizedName: string;
};

export interface FundJob {
  id: string;
  title: string;
  shortUUID: string;
  organizationName: string;
  location: string | null;
  commitment: string | null;
  publishedTimestamp: number | null;
}

export interface FundTeamMember {
  id: string;
  name: string;
  normalizedName: string;
  jobTitle: string | null;
  photoUrl: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
}

export interface FundInvestmentRound {
  id: string;
  roundName: string;
  date: number;
  raisedAmount: number;
  investedAmount: number | null;
  valuation: number | null;
  investorCount: number;
  fundParticipated: boolean;
  investmentRole: "recorded-solo" | "co-investor" | null;
  sourceLink: string | null;
  source: string | null;
}

export interface FundInvestment {
  organizationId: string;
  name: string;
  normalizedName: string;
  summary: string | null;
  logoUrl: string | null;
  website: string | null;
  vertical: string | null;
  sectors: string[];
  rounds: FundInvestmentRound[];
}

export interface FundDetails extends FundListItem {
  summary: string | null;
  description: string | null;
  location: string | null;
  team: FundTeamMember[];
  investments: FundInvestment[];
  jobs: FundJob[];
}

@Injectable()
export class InvestorsService {
  private readonly logger = new CustomLogger(InvestorsService.name);
  constructor(
    private readonly graph: GraphRepository,
    private readonly postgres: PostgresService,
  ) {}

  getEvSitemapFunds(): Promise<EvSitemapFund[]> {
    return this.postgres.query<EvSitemapFund>(`
      SELECT DISTINCT properties ->> 'normalizedName' AS "normalizedName"
      FROM graph_nodes
      WHERE label = 'Investor'
        AND lower(COALESCE(properties ->> 'isFund', 'false'))
            IN ('true', '1', 'yes', 'on')
        AND NULLIF(properties ->> 'normalizedName', '') IS NOT NULL
      ORDER BY "normalizedName"
    `);
  }

  getFundSectors(params: InvestorListParams = {}): Promise<FundSector[]> {
    const range = resolveFundActivityRange(params);
    const roundStages = resolveFundRoundStages(params.rounds);
    return this.postgres.query<FundSector & Record<string, unknown>>(
      `
        SELECT
          sector.name,
          count(DISTINCT (activity.fund_slug, activity.owner_node_id))::integer
            AS "companyCount"
        FROM fund_activity_documents activity
        CROSS JOIN LATERAL unnest(activity.sector_names) AS sector(name)
        WHERE activity.fund_participated
          AND activity.round_date >= $1
          AND activity.round_date < $2
          AND ($3::text[] IS NULL OR activity.round_stage = ANY($3))
        GROUP BY sector.name
        ORDER BY "companyCount" DESC, sector.name
      `,
      [range.from, range.toExclusive, roundStages],
    );
  }

  getFundRoundStages(
    params: InvestorListParams = {},
  ): Promise<FundRoundStage[]> {
    const range = resolveFundActivityRange(params);
    return this.postgres.query<FundRoundStage & Record<string, unknown>>(
      `
        SELECT
          activity.round_stage AS slug,
          CASE activity.round_stage
            WHEN 'pre-seed' THEN 'Pre-seed / Angel'
            WHEN 'seed' THEN 'Seed'
            WHEN 'series-a' THEN 'Series A'
            WHEN 'series-b' THEN 'Series B'
            WHEN 'series-c' THEN 'Series C'
            WHEN 'series-d' THEN 'Series D'
            WHEN 'series-e' THEN 'Series E'
            WHEN 'series-f-plus' THEN 'Series F+'
            WHEN 'pre-ipo' THEN 'Pre-IPO'
            WHEN 'public-markets' THEN 'IPO / Post-IPO'
            WHEN 'token-sale' THEN 'Token sale'
            WHEN 'strategic' THEN 'Strategic'
            WHEN 'private' THEN 'Private'
            WHEN 'debt' THEN 'Debt'
            WHEN 'secondary' THEN 'M&A / Secondary'
            WHEN 'corporate' THEN 'Corporate'
            WHEN 'venture' THEN 'Venture'
            WHEN 'equity' THEN 'Equity / Crowdsale'
            ELSE 'Other / Unknown'
          END AS name,
          count(DISTINCT activity.fund_slug)::integer AS "fundCount",
          count(*)::integer AS "investmentCount"
        FROM fund_activity_documents activity
        WHERE activity.fund_participated
          AND activity.round_date >= $1
          AND activity.round_date < $2
          AND ($3::text IS NULL
            OR activity.sector_keys @> ARRAY[lower($3)])
        GROUP BY activity.round_stage
        ORDER BY min(COALESCE(activity.stage_rank, 100)), name
      `,
      [range.from, range.toExclusive, params.sector?.trim() || null],
    );
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: "fund-analytics-refresh" })
  async refreshFundAnalytics(): Promise<void> {
    if (process.env.MIDDLEWARE_SCHEDULE_OWNER !== "1") return;

    try {
      const [result] = await this.postgres.query<{ refreshed: number }>(`
        SELECT refresh_dirty_fund_analytics_documents(200) AS refreshed
      `);
      if (Number(result?.refreshed ?? 0) > 0) {
        this.logger.log(
          `Refreshed ${result.refreshed} dirty fund analytics documents`,
        );
      }
    } catch (error) {
      Sentry.captureException(error);
      this.logger.error(
        `InvestorsService::refreshFundAnalytics ${String(error)}`,
      );
    }
  }

  async getFundList(
    params: InvestorListParams,
  ): Promise<PaginatedData<FundListItem>> {
    const safePage = Math.max(1, Math.trunc(params.page ?? 1));
    const safeLimit = Math.max(
      1,
      Math.min(100, Math.trunc(params.limit ?? 20)),
    );
    const offset = (safePage - 1) * safeLimit;
    const range = resolveFundActivityRange(params);
    const roundStages = resolveFundRoundStages(params.rounds);
    const orderBy = params.orderBy ?? "lastInvestmentDate";
    const orderExpressions: Record<FundListOrderBy, string> = {
      lastInvestmentDate: "metrics.last_investment_date",
      totalInvestedCapital: "metrics.known_round_capital",
      knownRoundCapital: "metrics.known_round_capital",
      progressionRate: "progression.progression_rate",
      medianRoundSizeStepUp: "progression.median_round_size_step_up",
      medianValuationStepUp: "progression.median_valuation_step_up",
      soloRate: "metrics.solo_rate",
      portfolioCount: "metrics.portfolio_count",
      staffCount: "document.staff_count",
      name: "lower(document.name)",
    };
    const direction = params.order === "asc" ? "ASC" : "DESC";
    const orderExpression = orderExpressions[orderBy];
    const rows = await this.postgres.query<{
      payload: FundListItem;
      total: string;
    }>(
      `
        WITH scoped_activity AS MATERIALIZED (
          SELECT activity.*
          FROM fund_activity_documents activity
          WHERE activity.fund_participated
            AND activity.round_date >= $11
            AND activity.round_date < $12
            AND ($13::text[] IS NULL OR activity.round_stage = ANY($13))
            AND ($10::text IS NULL
              OR activity.sector_keys @> ARRAY[lower($10)])
        ),
        fund_entries AS MATERIALIZED (
          SELECT DISTINCT ON (activity.fund_slug, activity.owner_node_id)
            activity.fund_slug,
            activity.owner_node_id,
            activity.round_date AS entry_date,
            activity.round_amount AS entry_round_amount,
            activity.valuation AS entry_valuation,
            activity.stage_rank AS entry_stage_rank
          FROM scoped_activity activity
          ORDER BY
            activity.fund_slug,
            activity.owner_node_id,
            activity.round_date,
            activity.round_key
        ),
        company_progress AS MATERIALIZED (
          SELECT
            entry.fund_slug,
            entry.owner_node_id,
            count(history.round_key)::integer AS follow_on_round_count,
            sum(history.round_amount) FILTER (WHERE history.round_amount > 0)
              AS follow_on_round_capital,
            entry.entry_round_amount,
            entry.entry_valuation,
            entry.entry_stage_rank,
            (array_agg(
              history.round_amount
              ORDER BY history.round_date DESC, history.round_key DESC
            ) FILTER (WHERE history.round_amount > 0))[1]
              AS latest_round_amount,
            (array_agg(
              history.valuation
              ORDER BY history.round_date DESC, history.round_key DESC
            ) FILTER (WHERE history.valuation > 0))[1]
              AS latest_valuation,
            max(history.stage_rank) AS latest_stage_rank
          FROM fund_entries entry
          LEFT JOIN fund_activity_documents history
            ON history.fund_slug = entry.fund_slug
           AND history.owner_node_id = entry.owner_node_id
           AND history.round_date > entry.entry_date
           AND history.round_date < $12
          GROUP BY
            entry.fund_slug,
            entry.owner_node_id,
            entry.entry_round_amount,
            entry.entry_valuation,
            entry.entry_stage_rank
        ),
        fund_metrics AS MATERIALIZED (
          SELECT
            activity.fund_slug,
            count(DISTINCT activity.owner_node_id)::integer AS portfolio_count,
            count(*)::integer AS investment_round_count,
            count(*) FILTER (WHERE activity.round_amount > 0)::integer
              AS known_round_count,
            count(*) FILTER (WHERE activity.valuation > 0)::integer
              AS valuation_round_count,
            sum(activity.round_amount) FILTER (WHERE activity.round_amount > 0)
              AS known_round_capital,
            max(activity.round_date)::bigint AS last_investment_date,
            count(*) FILTER (WHERE activity.investor_count = 1)::integer
              AS solo_round_count,
            count(*) FILTER (WHERE activity.investor_count > 1)::integer
              AS syndicated_round_count,
            round(
              100.0 * count(*) FILTER (WHERE activity.investor_count = 1)
              / NULLIF(count(*), 0),
              1
            ) AS solo_rate,
            array_agg(DISTINCT activity.round_stage ORDER BY activity.round_stage)
              AS round_stages
          FROM scoped_activity activity
          GROUP BY activity.fund_slug
        ),
        progression_metrics AS MATERIALIZED (
          SELECT
            progress.fund_slug,
            count(*) FILTER (WHERE progress.follow_on_round_count > 0)::integer
              AS progressed_company_count,
            round(
              100.0 * count(*) FILTER (WHERE progress.follow_on_round_count > 0)
              / NULLIF(count(*), 0),
              1
            ) AS progression_rate,
            count(*) FILTER (
              WHERE progress.latest_stage_rank > progress.entry_stage_rank
            )::integer AS stage_progressed_company_count,
            count(*) FILTER (
              WHERE progress.entry_stage_rank IS NOT NULL
                AND progress.latest_stage_rank IS NOT NULL
            )::integer AS stage_tracked_company_count,
            round(
              100.0 * count(*) FILTER (
                WHERE progress.latest_stage_rank > progress.entry_stage_rank
              ) / NULLIF(count(*) FILTER (
                WHERE progress.entry_stage_rank IS NOT NULL
                  AND progress.latest_stage_rank IS NOT NULL
              ), 0),
              1
            ) AS stage_progression_rate,
            sum(progress.follow_on_round_capital) AS follow_on_round_capital,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY progress.latest_round_amount
                / NULLIF(progress.entry_round_amount, 0)
            ) FILTER (
              WHERE progress.latest_round_amount > 0
                AND progress.entry_round_amount > 0
            ) AS median_round_size_step_up,
            count(*) FILTER (
              WHERE progress.latest_round_amount > 0
                AND progress.entry_round_amount > 0
            )::integer AS round_size_step_up_sample,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY progress.latest_valuation
                / NULLIF(progress.entry_valuation, 0)
            ) FILTER (
              WHERE progress.latest_valuation > 0
                AND progress.entry_valuation > 0
            ) AS median_valuation_step_up,
            count(*) FILTER (
              WHERE progress.latest_valuation > 0
                AND progress.entry_valuation > 0
            )::integer AS valuation_step_up_sample
          FROM company_progress progress
          GROUP BY progress.fund_slug
        ),
        sector_counts AS MATERIALIZED (
          SELECT
            activity.fund_slug,
            sector.name,
            count(DISTINCT activity.owner_node_id)::integer AS company_count
          FROM scoped_activity activity
          CROSS JOIN LATERAL unnest(activity.sector_names) AS sector(name)
          GROUP BY activity.fund_slug, sector.name
        ),
        sector_metrics AS MATERIALIZED (
          SELECT
            ranked.fund_slug,
            jsonb_agg(
              jsonb_build_object(
                'name', ranked.name,
                'companyCount', ranked.company_count
              ) ORDER BY ranked.company_count DESC, ranked.name
            ) FILTER (WHERE ranked.position <= 3) AS top_sectors
          FROM (
            SELECT
              counts.*,
              row_number() OVER (
                PARTITION BY counts.fund_slug
                ORDER BY counts.company_count DESC, counts.name
              ) AS position
            FROM sector_counts counts
          ) ranked
          GROUP BY ranked.fund_slug
        )
        SELECT jsonb_build_object(
          'id', document.fund_id,
          'name', document.name,
          'normalizedName', document.normalized_name,
          'logoUrl', document.logo_url,
          'website', document.website,
          'twitter', document.twitter,
          'staffCount', document.staff_count,
          'socialStaffCount', document.social_staff_count,
          'portfolioCount', metrics.portfolio_count,
          'totalInvestedCapital', NULL,
          'knownRoundCapital', metrics.known_round_capital,
          'knownRoundCount', metrics.known_round_count,
          'valuationRoundCount', metrics.valuation_round_count,
          'investmentRoundCount', metrics.investment_round_count,
          'ambiguousRoundCount', document.ambiguous_round_count,
          'soloRoundCount', metrics.solo_round_count,
          'syndicatedRoundCount', metrics.syndicated_round_count,
          'soloRate', metrics.solo_rate,
          'progressedCompanyCount', progression.progressed_company_count,
          'progressionRate', progression.progression_rate,
          'stageProgressedCompanyCount',
            progression.stage_progressed_company_count,
          'stageTrackedCompanyCount', progression.stage_tracked_company_count,
          'stageProgressionRate', progression.stage_progression_rate,
          'followOnRoundCapital', progression.follow_on_round_capital,
          'medianRoundSizeStepUp', progression.median_round_size_step_up,
          'roundSizeStepUpSample', progression.round_size_step_up_sample,
          'medianValuationStepUp', progression.median_valuation_step_up,
          'valuationStepUpSample', progression.valuation_step_up_sample,
          'topSectors', COALESCE(sectors.top_sectors, '[]'::jsonb),
          'lastInvestmentDate', metrics.last_investment_date,
          'jobCount', document.job_count,
          'activityWindow', $14::text,
          'activityFromDate', $15::bigint,
          'activityToDate', $16::bigint,
          'roundStages', metrics.round_stages
        ) AS payload,
        count(*) OVER ()::text AS total
        FROM fund_analytics_documents document
        JOIN fund_metrics metrics
          ON metrics.fund_slug = document.normalized_name
        JOIN progression_metrics progression
          ON progression.fund_slug = document.normalized_name
        LEFT JOIN sector_metrics sectors
          ON sectors.fund_slug = document.normalized_name
        WHERE ($3::text IS NULL
          OR document.name ILIKE '%' || $3 || '%'
          OR document.normalized_name ILIKE '%' || $3 || '%')
          AND ($4::numeric IS NULL OR metrics.known_round_capital >= $4)
          AND ($5::integer IS NULL OR metrics.portfolio_count >= $5)
          AND ($6::boolean IS NULL OR (document.job_count > 0) = $6)
          AND ($7::boolean IS NULL
            OR (document.social_staff_count > 0) = $7)
          AND ($8::numeric IS NULL OR progression.progression_rate >= $8)
          AND ($9::boolean IS NULL
            OR (metrics.solo_round_count > 0) = $9)
        ORDER BY ${orderExpression} ${direction} NULLS LAST,
          lower(document.name) ASC,
          document.fund_id ASC
        LIMIT $1 OFFSET $2
      `,
      [
        safeLimit,
        offset,
        params.query?.trim() || null,
        params.minKnownRoundCapital ?? params.minInvestedCapital ?? null,
        params.minPortfolioCount ?? null,
        params.hasJobs ?? null,
        params.hasTeamSocials ?? null,
        params.minProgressionRate ?? null,
        params.hasSoloInvestments ?? null,
        params.sector?.trim() || null,
        range.from,
        range.toExclusive,
        roundStages,
        range.window,
        range.responseFrom,
        range.responseTo,
      ],
    );
    return {
      page: safePage,
      total: Number(rows[0]?.total ?? 0),
      count: rows.length,
      data: rows.map(({ payload }) => payload),
    };
  }

  async getFundDetailsBySlug(
    slug: string,
    params: InvestorListParams = {},
  ): Promise<FundDetails | undefined> {
    type DetailPayload = Pick<
      FundDetails,
      | "summary"
      | "description"
      | "location"
      | "website"
      | "twitter"
      | "team"
      | "investments"
      | "jobs"
    >;
    const [fundList, rows] = await Promise.all([
      this.getFundList({
        ...params,
        activityWindow: params.activityWindow ?? "all",
        page: 1,
        limit: 100,
        query: slug,
      }),
      this.postgres.query<{ payload: DetailPayload }>(
        `
          WITH selected_funds AS (
            SELECT id AS node_id, properties
            FROM graph_nodes
            WHERE label = 'Investor'
              AND properties ->> 'normalizedName' = $1
              AND lower(COALESCE(properties ->> 'isFund', 'false'))
                  IN ('true', '1', 'yes', 'on')
          ),
          canonical_fund AS (
            SELECT
              (array_agg(properties ->> 'summary' ORDER BY node_id)
                FILTER (WHERE NULLIF(properties ->> 'summary', '') IS NOT NULL))[1]
                AS summary,
              (array_agg(properties ->> 'description' ORDER BY node_id)
                FILTER (WHERE NULLIF(properties ->> 'description', '') IS NOT NULL))[1]
                AS description,
              (array_agg(properties ->> 'location' ORDER BY node_id)
                FILTER (WHERE NULLIF(properties ->> 'location', '') IS NOT NULL))[1]
                AS location
            FROM selected_funds
            HAVING count(*) > 0
          ),
          related AS (
            SELECT
              min(node.properties ->> 'url')
                FILTER (WHERE edge.type = 'HAS_WEBSITE') AS website,
              min(node.properties ->> 'username')
                FILTER (WHERE edge.type = 'HAS_TWITTER') AS twitter
            FROM selected_funds fund
            LEFT JOIN graph_relationships edge
              ON edge.source_id = fund.node_id
            LEFT JOIN graph_nodes node ON node.id = edge.target_id
          ),
          team_candidates AS (
            SELECT
              COALESCE(
                NULLIF(staff.properties ->> 'normalizedName', ''),
                staff.id::text
              ) AS member_key,
              staff.id AS staff_node_id,
              lower(COALESCE(staff.properties ->> 'name', '')) AS sort_name,
              jsonb_build_object(
                'id', staff.properties ->> 'id',
                'name', staff.properties ->> 'name',
                'normalizedName', staff.properties ->> 'normalizedName',
                'jobTitle', COALESCE(
                  staff.properties ->> 'jobTitle',
                  staff.properties ->> 'title',
                  staff.properties ->> 'role'
                ),
                'photoUrl', staff.properties ->> 'photoUrl',
                'linkedinUrl', COALESCE(
                  NULLIF(staff.properties ->> 'linkedinUrl', ''),
                  (
                    SELECT CASE
                      WHEN social.properties ->> 'url' ~ '^https?://'
                        THEN social.properties ->> 'url'
                      WHEN NULLIF(btrim(social.properties ->> 'username'), '')
                          IS NOT NULL
                        THEN concat(
                          'https://www.linkedin.com/in/',
                          regexp_replace(
                            btrim(social.properties ->> 'username'),
                            '^@',
                            ''
                          )
                        )
                    END
                    FROM graph_relationships social_edge
                    JOIN graph_nodes social
                      ON social.id = social_edge.target_id
                    WHERE social_edge.source_id = staff.id
                      AND social_edge.type = 'HAS_LINKEDIN'
                    ORDER BY social.id
                    LIMIT 1
                  )
                ),
                'twitterUrl', COALESCE(
                  NULLIF(staff.properties ->> 'twitterUrl', ''),
                  (
                    SELECT CASE
                      WHEN social.properties ->> 'url' ~ '^https?://'
                        THEN social.properties ->> 'url'
                      WHEN NULLIF(btrim(social.properties ->> 'username'), '')
                          IS NOT NULL
                        THEN concat(
                          'https://x.com/',
                          regexp_replace(
                            btrim(social.properties ->> 'username'),
                            '^@',
                            ''
                          )
                        )
                    END
                    FROM graph_relationships social_edge
                    JOIN graph_nodes social
                      ON social.id = social_edge.target_id
                    WHERE social_edge.source_id = staff.id
                      AND social_edge.type = 'HAS_TWITTER'
                    ORDER BY social.id
                    LIMIT 1
                  )
                )
              ) AS payload
            FROM selected_funds fund
            JOIN graph_relationships staff_edge
              ON staff_edge.source_id = fund.node_id
             AND staff_edge.type = 'HAS_STAFF'
            JOIN graph_nodes staff
              ON staff.id = staff_edge.target_id
             AND staff.label = 'Staff'
          ),
          team AS (
            SELECT COALESCE(
              jsonb_agg(member.payload ORDER BY member.sort_name),
              '[]'::jsonb
            ) AS members
            FROM (
              SELECT DISTINCT ON (member_key)
                member_key, sort_name, payload
              FROM team_candidates
              ORDER BY member_key, staff_node_id
            ) member
          ),
          selected_investment_edges AS MATERIALIZED (
            SELECT DISTINCT
              investment.source_id AS raw_round_node_id
            FROM selected_funds fund
            JOIN graph_relationships investment
              ON investment.target_id = fund.node_id
             AND investment.type = 'HAS_INVESTOR'
          ),
          selected_round_ownership AS MATERIALIZED (
            SELECT
              selected.raw_round_node_id,
              min(owner_edge.source_id) AS owner_node_id,
              count(DISTINCT owner_edge.source_id)::int AS owner_count
            FROM selected_investment_edges selected
            JOIN graph_relationships owner_edge
              ON owner_edge.target_id = selected.raw_round_node_id
             AND owner_edge.type = 'HAS_FUNDING_ROUND'
            JOIN graph_nodes owner
              ON owner.id = owner_edge.source_id
             AND owner.label = 'Organization'
            GROUP BY selected.raw_round_node_id
          ),
          selected_fund_round_nodes AS MATERIALIZED (
            SELECT
              selected.raw_round_node_id,
              ownership.owner_node_id
            FROM selected_investment_edges selected
            JOIN selected_round_ownership ownership
              ON ownership.raw_round_node_id = selected.raw_round_node_id
             AND ownership.owner_count = 1
            JOIN graph_nodes owner
              ON owner.id = ownership.owner_node_id
             AND owner.label = 'Organization'
             AND lower(COALESCE(owner.properties ->> 'banned', 'false'))
                 NOT IN ('true', '1', 'yes', 'on')
          ),
          portfolio AS MATERIALIZED (
            SELECT DISTINCT owner_node_id
            FROM selected_fund_round_nodes
          ),
          raw_valid_rounds AS MATERIALIZED (
            SELECT
              funding_round.id AS round_node_id,
              owner_edge.source_id AS owner_node_id,
              funding_round.properties ->> 'id' AS id,
              funding_round.properties ->> 'roundName' AS round_name,
              COALESCE(
                jsonb_numeric_value(funding_round.properties, 'date'),
                0
              ) AS round_date,
              CASE
                WHEN NULLIF(funding_round.properties ->> 'source', '') IS NULL
                  THEN jsonb_numeric_value(
                    funding_round.properties,
                    'raisedAmount'
                  ) * 1000000
                ELSE jsonb_numeric_value(
                  funding_round.properties,
                  'raisedAmount'
                )
              END AS round_amount,
              jsonb_numeric_value(
                funding_round.properties,
                'valuation'
              ) AS valuation,
              funding_round.properties ->> 'sourceLink' AS source_link,
              funding_round.properties ->> 'source' AS source
            FROM portfolio
            JOIN graph_relationships owner_edge
              ON owner_edge.source_id = portfolio.owner_node_id
             AND owner_edge.type = 'HAS_FUNDING_ROUND'
            JOIN graph_nodes funding_round
              ON funding_round.id = owner_edge.target_id
             AND funding_round.label = 'FundingRound'
            WHERE NOT EXISTS (
              SELECT 1
              FROM graph_relationships other_owner
              JOIN graph_nodes other_owner_node
                ON other_owner_node.id = other_owner.source_id
               AND other_owner_node.label = 'Organization'
              WHERE other_owner.target_id = owner_edge.target_id
                AND other_owner.type = 'HAS_FUNDING_ROUND'
                AND other_owner.source_id <> owner_edge.source_id
            )
          ),
          round_event_nodes AS (
            SELECT
              round_node_id AS raw_round_node_id,
              concat_ws(
                ':',
                owner_node_id::text,
                lower(btrim(round_name)),
                to_char(
                  to_timestamp(round_date::double precision),
                  'YYYY-MM'
                )
              ) AS round_key
            FROM raw_valid_rounds
          ),
          valid_rounds AS (
            SELECT
              event.round_key,
              min(round.round_node_id) AS round_node_id,
              min(round.owner_node_id) AS owner_node_id,
              (array_agg(
                round.id
                ORDER BY (round.source IS NULL), round.round_node_id
              ) FILTER (WHERE round.id IS NOT NULL))[1] AS id,
              (array_agg(
                round.round_name
                ORDER BY (round.source IS NULL), round.round_node_id
              ))[1] AS round_name,
              max(round.round_date) AS round_date,
              max(round.round_amount) AS round_amount,
              max(round.valuation) AS valuation,
              (array_agg(
                round.source_link
                ORDER BY (round.source IS NULL), round.round_node_id
              ) FILTER (WHERE round.source_link IS NOT NULL))[1]
                AS source_link,
              (array_agg(
                round.source
                ORDER BY (round.source IS NULL), round.round_node_id
              ) FILTER (WHERE round.source IS NOT NULL))[1] AS source
            FROM raw_valid_rounds round
            JOIN round_event_nodes event
              ON event.raw_round_node_id = round.round_node_id
            GROUP BY event.round_key
          ),
          fund_rounds AS (
            SELECT DISTINCT event.round_key
            FROM selected_fund_round_nodes investment
            JOIN round_event_nodes event
              ON event.raw_round_node_id = investment.raw_round_node_id
          ),
          round_investor_counts AS (
            SELECT
              event.round_key,
              count(DISTINCT COALESCE(
                NULLIF(investor.properties ->> 'normalizedName', ''),
                investor.id::text
              ))::int AS investor_count
            FROM graph_relationships investment
            JOIN graph_nodes investor
              ON investor.id = investment.target_id
             AND investor.label = 'Investor'
            JOIN round_event_nodes event
              ON event.raw_round_node_id = investment.source_id
            WHERE investment.type = 'HAS_INVESTOR'
            GROUP BY event.round_key
          ),
          portfolio_rounds AS (
            SELECT
              round.*,
              COALESCE(counts.investor_count, 0) AS investor_count,
              (fund_round.round_key IS NOT NULL) AS fund_participated
            FROM portfolio
            JOIN valid_rounds round
              ON round.owner_node_id = portfolio.owner_node_id
            LEFT JOIN fund_rounds fund_round
              ON fund_round.round_key = round.round_key
            LEFT JOIN round_investor_counts counts
              ON counts.round_key = round.round_key
          ),
          investment_rows AS (
            SELECT
              lower(COALESCE(owner.properties ->> 'name', '')) AS sort_name,
              jsonb_build_object(
                'organizationId', owner.properties ->> 'orgId',
                'name', owner.properties ->> 'name',
                'normalizedName', owner.properties ->> 'normalizedName',
                'summary', owner.properties ->> 'summary',
                'logoUrl', owner.properties ->> 'logoUrl',
                'website', (
                  SELECT min(website.properties ->> 'url')
                  FROM graph_relationships website_edge
                  JOIN graph_nodes website
                    ON website.id = website_edge.target_id
                  WHERE website_edge.source_id = owner.id
                    AND website_edge.type = 'HAS_WEBSITE'
                ),
                'vertical', owner.properties ->> 'vertical',
                'sectors', COALESCE((
                  SELECT array_agg(
                    DISTINCT sector.properties ->> 'name'
                    ORDER BY sector.properties ->> 'name'
                  )
                  FROM graph_relationships sector_edge
                  JOIN graph_nodes sector
                    ON sector.id = sector_edge.target_id
                   AND sector.label = 'OrganizationSector'
                  WHERE sector_edge.source_id = owner.id
                    AND sector_edge.type = 'HAS_SECTOR'
                    AND NULLIF(sector.properties ->> 'name', '') IS NOT NULL
                ), ARRAY[]::text[]),
                'rounds', jsonb_agg(
                  jsonb_build_object(
                    'id', round.id,
                    'roundName', round.round_name,
                    'date', round.round_date,
                    'raisedAmount', COALESCE(round.round_amount, 0),
                    'investedAmount', NULL,
                    'valuation', round.valuation,
                    'investorCount', round.investor_count,
                    'fundParticipated', round.fund_participated,
                    'investmentRole', CASE
                      WHEN NOT round.fund_participated THEN NULL
                      WHEN round.investor_count = 1 THEN 'recorded-solo'
                      ELSE 'co-investor'
                    END,
                    'sourceLink', round.source_link,
                    'source', round.source
                  )
                  ORDER BY round.round_date, round.round_node_id
                )
              ) AS payload
            FROM portfolio
            JOIN graph_nodes owner
              ON owner.id = portfolio.owner_node_id
             AND owner.label = 'Organization'
            JOIN portfolio_rounds round
              ON round.owner_node_id = portfolio.owner_node_id
            GROUP BY owner.id, owner.properties
          ),
          investments AS (
            SELECT COALESCE(
              jsonb_agg(payload ORDER BY sort_name),
              '[]'::jsonb
            ) AS companies
            FROM investment_rows
          ),
          fund_jobs AS (
            SELECT COALESCE(
              jsonb_agg(
                job_row.payload
                ORDER BY job_row.published_timestamp DESC NULLS LAST,
                  job_row.id
              ) FILTER (WHERE job_row.position <= 20),
              '[]'::jsonb
            ) AS jobs
            FROM (
              SELECT
                row_number() OVER (
                  ORDER BY job.published_timestamp DESC NULLS LAST,
                    job.job_node_id
                ) AS position,
                job.job_node_id AS id,
                job.published_timestamp,
                jsonb_build_object(
                  'id', COALESCE(
                    job.payload ->> 'id',
                    job.structured_jobpost_id
                  ),
                  'title', job.title,
                  'shortUUID', job.short_uuid,
                  'organizationName', organization.name,
                  'location', job.location,
                  'commitment', job.payload ->> 'commitment',
                  'publishedTimestamp', COALESCE(
                    (job.payload ->> 'timestamp')::numeric,
                    extract(epoch FROM job.published_at)
                  )
                ) AS payload
              FROM job_search_documents job
              JOIN organization_search_documents organization
                ON organization.organization_id = job.organization_id
              WHERE job.online
                AND NOT job.blocked
                AND job.legacy_list_eligible
                AND cardinality(job.tags) > 0
                AND NOT (
                  job.access = 'public'
                  AND job.organization_has_expert_jobs
                )
                AND $1 = ANY(organization.investors)
            ) job_row
          )
          SELECT jsonb_build_object(
            'summary', fund.summary,
            'description', fund.description,
            'location', fund.location,
            'website', related.website,
            'twitter', related.twitter,
            'team', team.members,
            'investments', investments.companies,
            'jobs', fund_jobs.jobs
          ) AS payload
          FROM canonical_fund fund
          CROSS JOIN related
          CROSS JOIN team
          CROSS JOIN investments
          CROSS JOIN fund_jobs
        `,
        [slug],
      ),
    ]);
    const fund = fundList.data.find(item => item.normalizedName === slug);
    const details = rows[0]?.payload;
    return fund && details ? { ...fund, ...details } : undefined;
  }

  async getInvestorList(
    page: number,
    limit: number,
  ): Promise<PaginatedData<Investor>> {
    try {
      const investors =
        await this.graph.findNodes<Record<string, unknown>>("Investor");

      return paginate(
        page,
        limit,
        sort<Investor>(
          investors.map(
            investor =>
              new Investor(investor.properties as unknown as Investor),
          ),
        ).asc(x => x.name),
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "investors.service",
        });
        scope.setExtra("input", { page, limit });
        Sentry.captureException(err);
      });
      this.logger.error(`InvestorsService::getInvestorList ${err.message}`);
      return {
        page: -1,
        total: 0,
        count: 0,
        data: [],
      };
    }
  }

  async getInvestorDetailsBySlug(slug: string): Promise<Investor | undefined> {
    try {
      const investor = await this.graph.findNode<Record<string, unknown>>(
        "Investor",
        { normalizedName: slug },
      );
      return investor
        ? new Investor(investor.properties as unknown as Investor)
        : undefined;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "investors.service",
        });
        scope.setExtra("input", slug);
        Sentry.captureException(err);
      });
      this.logger.error(
        `InvestorsService::getInvestorDetailsBySlug ${err.message}`,
      );
      return undefined;
    }
  }
}
