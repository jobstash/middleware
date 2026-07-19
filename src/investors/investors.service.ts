import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Investor, PaginatedData } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { paginate } from "src/shared/helpers";
import { sort } from "fast-sort";
import { GraphRepository } from "src/postgres/graph.repository";
import { PostgresService } from "src/postgres/postgres.service";
import { FundListOrderBy, InvestorListParams } from "./dto/investor-list.input";

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
}

export interface FundSector {
  name: string;
  companyCount: number;
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

  getFundSectors(): Promise<FundSector[]> {
    return this.postgres.query<FundSector & Record<string, unknown>>(`
      SELECT
        sector.value ->> 'name' AS name,
        sum((sector.value ->> 'companyCount')::integer)::integer
          AS "companyCount"
      FROM fund_analytics_documents document
      CROSS JOIN LATERAL jsonb_array_elements(document.sector_breakdown)
        AS sector(value)
      GROUP BY sector.value ->> 'name'
      ORDER BY "companyCount" DESC, name
    `);
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
    const orderBy = params.orderBy ?? "lastInvestmentDate";
    const orderExpressions: Record<FundListOrderBy, string> = {
      lastInvestmentDate: "document.last_investment_date",
      totalInvestedCapital: "document.known_round_capital",
      knownRoundCapital: "document.known_round_capital",
      progressionRate: "document.progression_rate",
      medianRoundSizeStepUp: "document.median_round_size_step_up",
      medianValuationStepUp: "document.median_valuation_step_up",
      soloRate: "document.solo_rate",
      portfolioCount: "document.portfolio_count",
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
        SELECT jsonb_build_object(
          'id', document.fund_id,
          'name', document.name,
          'normalizedName', document.normalized_name,
          'logoUrl', document.logo_url,
          'website', document.website,
          'twitter', document.twitter,
          'staffCount', document.staff_count,
          'socialStaffCount', document.social_staff_count,
          'portfolioCount', document.portfolio_count,
          'totalInvestedCapital', document.total_invested_capital,
          'knownRoundCapital', document.known_round_capital,
          'knownRoundCount', document.known_round_count,
          'valuationRoundCount', document.valuation_round_count,
          'investmentRoundCount', document.investment_round_count,
          'ambiguousRoundCount', document.ambiguous_round_count,
          'soloRoundCount', document.solo_round_count,
          'syndicatedRoundCount', document.syndicated_round_count,
          'soloRate', document.solo_rate,
          'progressedCompanyCount', document.progressed_company_count,
          'progressionRate', document.progression_rate,
          'stageProgressedCompanyCount',
            document.stage_progressed_company_count,
          'stageTrackedCompanyCount', document.stage_tracked_company_count,
          'stageProgressionRate', document.stage_progression_rate,
          'followOnRoundCapital', document.follow_on_round_capital,
          'medianRoundSizeStepUp', document.median_round_size_step_up,
          'roundSizeStepUpSample', document.round_size_step_up_sample,
          'medianValuationStepUp', document.median_valuation_step_up,
          'valuationStepUpSample', document.valuation_step_up_sample,
          'topSectors', document.top_sectors,
          'lastInvestmentDate', document.last_investment_date,
          'jobCount', document.job_count
        ) AS payload,
        count(*) OVER ()::text AS total
        FROM fund_analytics_documents document
        WHERE ($3::text IS NULL
          OR document.name ILIKE '%' || $3 || '%'
          OR document.normalized_name ILIKE '%' || $3 || '%')
          AND ($4::numeric IS NULL OR document.known_round_capital >= $4)
          AND ($5::integer IS NULL OR document.portfolio_count >= $5)
          AND ($6::boolean IS NULL OR (document.job_count > 0) = $6)
          AND ($7::boolean IS NULL
            OR (document.social_staff_count > 0) = $7)
          AND ($8::numeric IS NULL OR document.progression_rate >= $8)
          AND ($9::boolean IS NULL
            OR (document.solo_round_count > 0) = $9)
          AND ($10::text IS NULL
            OR lower($10) = ANY(document.sector_names))
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
      ],
    );
    return {
      page: safePage,
      total: Number(rows[0]?.total ?? 0),
      count: rows.length,
      data: rows.map(({ payload }) => payload),
    };
  }

  async getFundDetailsBySlug(slug: string): Promise<FundDetails | undefined> {
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
      this.getFundList({ page: 1, limit: 100, query: slug }),
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
          round_ownership AS (
            SELECT
              relationship.target_id AS round_node_id,
              min(relationship.source_id) AS owner_node_id,
              count(DISTINCT relationship.source_id)::int AS owner_count
            FROM graph_relationships relationship
            JOIN graph_nodes owner
              ON owner.id = relationship.source_id
             AND owner.label = 'Organization'
            WHERE relationship.type = 'HAS_FUNDING_ROUND'
            GROUP BY relationship.target_id
          ),
          raw_valid_rounds AS (
            SELECT
              funding_round.id AS round_node_id,
              ownership.owner_node_id,
              funding_round.properties ->> 'id' AS id,
              funding_round.properties ->> 'roundName' AS round_name,
              COALESCE(
                (funding_round.properties ->> 'date')::numeric,
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
            FROM graph_nodes funding_round
            JOIN round_ownership ownership
              ON ownership.round_node_id = funding_round.id
             AND ownership.owner_count = 1
            JOIN graph_nodes owner
              ON owner.id = ownership.owner_node_id
             AND owner.label = 'Organization'
            WHERE funding_round.label = 'FundingRound'
              AND lower(COALESCE(owner.properties ->> 'banned', 'false'))
                  NOT IN ('true', '1', 'yes', 'on')
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
            FROM graph_relationships investment
            JOIN selected_funds fund ON fund.node_id = investment.target_id
            JOIN round_event_nodes event
              ON event.raw_round_node_id = investment.source_id
            WHERE investment.type = 'HAS_INVESTOR'
          ),
          portfolio AS (
            SELECT DISTINCT round.owner_node_id
            FROM fund_rounds investment
            JOIN valid_rounds round
              ON round.round_key = investment.round_key
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
