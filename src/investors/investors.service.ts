import { Injectable } from "@nestjs/common";
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
  portfolioCount: number;
  totalInvestedCapital: number;
  lastInvestmentDate: number | null;
  jobCount: number;
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
      lastInvestmentDate: '"lastInvestmentDate"',
      totalInvestedCapital: '"totalInvestedCapital"',
      portfolioCount: '"portfolioCount"',
      staffCount: '"staffCount"',
      name: 'lower("name")',
    };
    const direction = params.order === "asc" ? "ASC" : "DESC";
    const orderExpression = orderExpressions[orderBy];
    const rows = await this.postgres.query<{
      payload: FundListItem;
      total: string;
    }>(
      `
        WITH fund_base AS (
          SELECT
            fund.id AS node_id,
            fund.properties
          FROM graph_nodes fund
          WHERE fund.label = 'Investor'
            AND lower(COALESCE(fund.properties ->> 'isFund', 'false'))
                IN ('true', '1', 'yes', 'on')
        ),
        job_counts AS (
          SELECT
            fund.node_id AS fund_node_id,
            count(DISTINCT job.job_node_id)::int AS job_count
          FROM job_search_documents job
          JOIN organization_search_documents organization
            ON job.organization_id = organization.organization_id
          CROSS JOIN LATERAL unnest(organization.investors)
            AS investor(normalized_name)
          JOIN fund_base fund
            ON fund.properties ->> 'normalizedName' = investor.normalized_name
          WHERE job.online
            AND NOT job.blocked
            AND job.legacy_list_eligible
            AND cardinality(job.tags) > 0
            AND NOT (
              job.access = 'public'
              AND job.organization_has_expert_jobs
            )
          GROUP BY fund.node_id
        ),
        fund_rows AS (
          SELECT
            fund.properties ->> 'id' AS id,
            fund.properties ->> 'name' AS name,
            fund.properties ->> 'normalizedName' AS "normalizedName",
            fund.properties ->> 'logoUrl' AS "logoUrl",
            related.website,
            related.twitter,
            related.staff_count AS "staffCount",
            investments.portfolio_count AS "portfolioCount",
            investments.total_invested_capital AS "totalInvestedCapital",
            investments.last_investment_date AS "lastInvestmentDate",
            COALESCE(jobs.job_count, 0) AS "jobCount"
          FROM fund_base fund
          CROSS JOIN LATERAL (
            SELECT
              min(node.properties ->> 'url')
                FILTER (WHERE edge.type = 'HAS_WEBSITE') AS website,
              min(node.properties ->> 'username')
                FILTER (WHERE edge.type = 'HAS_TWITTER') AS twitter,
              count(*) FILTER (WHERE edge.type = 'HAS_STAFF')::int
                AS staff_count
            FROM graph_relationships edge
            JOIN graph_nodes node ON node.id = edge.target_id
            WHERE edge.source_id = fund.node_id
          ) related
          CROSS JOIN LATERAL (
            SELECT
              count(DISTINCT investment_round.organization_id)::int
                AS portfolio_count,
              COALESCE(sum(investment_round.raised_amount), 0)::float8
                AS total_invested_capital,
              max(investment_round.investment_date)::float8
                AS last_investment_date
            FROM (
              SELECT DISTINCT ON (funding_round.id)
                owner.id AS organization_id,
                CASE
                  WHEN NULLIF(funding_round.properties ->> 'source', '')
                      IS NULL
                    THEN COALESCE(
                      (funding_round.properties ->> 'raisedAmount')::numeric,
                      0
                    ) * 1000000
                  ELSE COALESCE(
                    (funding_round.properties ->> 'raisedAmount')::numeric,
                    0
                  )
                END AS raised_amount,
                COALESCE(
                  (funding_round.properties ->> 'date')::numeric,
                  0
                ) AS investment_date
              FROM graph_relationships investment
              JOIN graph_nodes funding_round
                ON funding_round.id = investment.source_id
               AND funding_round.label = 'FundingRound'
              JOIN graph_relationships ownership
                ON ownership.target_id = funding_round.id
               AND ownership.type = 'HAS_FUNDING_ROUND'
              JOIN graph_nodes owner
                ON owner.id = ownership.source_id
               AND owner.label = 'Organization'
              WHERE investment.target_id = fund.node_id
                AND investment.type = 'HAS_INVESTOR'
                AND lower(COALESCE(owner.properties ->> 'banned', 'false'))
                    NOT IN ('true', '1', 'yes', 'on')
              ORDER BY funding_round.id
            ) investment_round
          ) investments
          LEFT JOIN job_counts jobs ON jobs.fund_node_id = fund.node_id
        )
        SELECT jsonb_build_object(
          'id', id,
          'name', name,
          'normalizedName', "normalizedName",
          'logoUrl', "logoUrl",
          'website', website,
          'twitter', twitter,
          'staffCount', "staffCount",
          'portfolioCount', "portfolioCount",
          'totalInvestedCapital', "totalInvestedCapital",
          'lastInvestmentDate', "lastInvestmentDate",
          'jobCount', "jobCount"
        ) AS payload,
        count(*) OVER ()::text AS total
        FROM fund_rows
        WHERE ($3::text IS NULL
          OR name ILIKE '%' || $3 || '%'
          OR "normalizedName" ILIKE '%' || $3 || '%')
          AND ($4::float8 IS NULL OR "totalInvestedCapital" >= $4)
          AND ($5::int IS NULL OR "portfolioCount" >= $5)
          AND ($6::boolean IS NULL OR ("jobCount" > 0) = $6)
        ORDER BY ${orderExpression} ${direction} NULLS LAST,
          lower(name) ASC,
          id ASC
        LIMIT $1 OFFSET $2
      `,
      [
        safeLimit,
        offset,
        params.query?.trim() || null,
        params.minInvestedCapital ?? null,
        params.minPortfolioCount ?? null,
        params.hasJobs ?? null,
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
    const rows = await this.postgres.query<{ payload: FundDetails }>(
      `
        WITH selected_fund AS (
          SELECT *
          FROM graph_nodes
          WHERE label = 'Investor'
            AND properties ->> 'normalizedName' = $1
            AND lower(COALESCE(properties ->> 'isFund', 'false'))
                IN ('true', '1', 'yes', 'on')
          ORDER BY id
          LIMIT 1
        )
        SELECT jsonb_build_object(
          'id', fund.properties ->> 'id',
          'name', fund.properties ->> 'name',
          'normalizedName', fund.properties ->> 'normalizedName',
          'logoUrl', fund.properties ->> 'logoUrl',
          'summary', fund.properties ->> 'summary',
          'description', fund.properties ->> 'description',
          'location', fund.properties ->> 'location',
          'website', related.website,
          'twitter', related.twitter,
          'staffCount', jsonb_array_length(related.team),
          'portfolioCount', jsonb_array_length(related.investments),
          'totalInvestedCapital', investment_stats.total_invested_capital,
          'lastInvestmentDate', investment_stats.last_investment_date,
          'jobCount', fund_jobs.job_count,
          'team', related.team,
          'investments', related.investments,
          'jobs', fund_jobs.jobs
        ) AS payload
        FROM selected_fund fund
        CROSS JOIN LATERAL (
          SELECT
            min(node.properties ->> 'url')
              FILTER (WHERE edge.type = 'HAS_WEBSITE') AS website,
            min(node.properties ->> 'username')
              FILTER (WHERE edge.type = 'HAS_TWITTER') AS twitter,
            COALESCE((
              SELECT jsonb_agg(team_member.payload ORDER BY team_member.sort_name)
              FROM (
                SELECT DISTINCT ON (staff.id)
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
                          WHEN NULLIF(
                            btrim(social.properties ->> 'username'),
                            ''
                          ) IS NOT NULL
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
                          WHEN NULLIF(
                            btrim(social.properties ->> 'username'),
                            ''
                          ) IS NOT NULL
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
                FROM graph_relationships staff_edge
                JOIN graph_nodes staff ON staff.id = staff_edge.target_id
                WHERE staff_edge.source_id = fund.id
                  AND staff_edge.type = 'HAS_STAFF'
                  AND staff.label = 'Staff'
                ORDER BY staff.id, lower(COALESCE(staff.properties ->> 'name', ''))
              ) team_member
            ), '[]'::jsonb) AS team,
            COALESCE((
              SELECT jsonb_agg(
                portfolio_company.payload
                ORDER BY portfolio_company.sort_name
              )
              FROM (
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
                      JOIN graph_nodes website ON website.id = website_edge.target_id
                      WHERE website_edge.source_id = owner.id
                        AND website_edge.type = 'HAS_WEBSITE'
                    ),
                    'vertical', owner.properties ->> 'vertical',
                    'rounds', jsonb_agg(
                      DISTINCT jsonb_build_object(
                        'id', funding_round.properties ->> 'id',
                        'roundName', funding_round.properties ->> 'roundName',
                        'date', COALESCE(
                          (funding_round.properties ->> 'date')::numeric,
                          0
                        ),
                        'raisedAmount', COALESCE(
                          (funding_round.properties ->> 'raisedAmount')::numeric,
                          0
                        ),
                        'sourceLink', funding_round.properties ->> 'sourceLink',
                        'source', funding_round.properties ->> 'source'
                      )
                    )
                  ) AS payload
                FROM graph_relationships investment
                JOIN graph_nodes funding_round
                  ON funding_round.id = investment.source_id
                 AND funding_round.label = 'FundingRound'
                JOIN graph_relationships ownership
                  ON ownership.target_id = funding_round.id
                 AND ownership.type = 'HAS_FUNDING_ROUND'
                JOIN graph_nodes owner
                  ON owner.id = ownership.source_id
                 AND owner.label = 'Organization'
                WHERE investment.target_id = fund.id
                  AND investment.type = 'HAS_INVESTOR'
                  AND lower(COALESCE(owner.properties ->> 'banned', 'false'))
                      NOT IN ('true', '1', 'yes', 'on')
                GROUP BY
                  owner.id,
                  owner.properties ->> 'orgId',
                  owner.properties ->> 'name',
                  owner.properties ->> 'normalizedName',
                  owner.properties ->> 'summary',
                  owner.properties ->> 'logoUrl',
                  owner.properties ->> 'vertical'
              ) portfolio_company
            ), '[]'::jsonb) AS investments
          FROM graph_relationships edge
          JOIN graph_nodes node ON node.id = edge.target_id
          WHERE edge.source_id = fund.id
        ) related
        CROSS JOIN LATERAL (
          SELECT
            COALESCE(sum(
              CASE
                WHEN NULLIF(round.value ->> 'source', '') IS NULL
                  THEN COALESCE((round.value ->> 'raisedAmount')::numeric, 0)
                    * 1000000
                ELSE COALESCE((round.value ->> 'raisedAmount')::numeric, 0)
              END
            ), 0)::float8 AS total_invested_capital,
            max(COALESCE((round.value ->> 'date')::numeric, 0))::float8
              AS last_investment_date
          FROM jsonb_array_elements(related.investments) investment
          CROSS JOIN LATERAL jsonb_array_elements(
            COALESCE(investment.value -> 'rounds', '[]'::jsonb)
          ) round(value)
        ) investment_stats
        CROSS JOIN LATERAL (
          SELECT
            count(*)::int AS job_count,
            COALESCE(jsonb_agg(job_row.payload ORDER BY
              job_row.published_timestamp DESC NULLS LAST,
              job_row.id
            ) FILTER (WHERE job_row.position <= 20), '[]'::jsonb) AS jobs
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
              AND fund.properties ->> 'normalizedName'
                  = ANY(organization.investors)
          ) job_row
        ) fund_jobs
      `,
      [slug],
    );
    return rows[0]?.payload;
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
