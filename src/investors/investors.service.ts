import { Injectable } from "@nestjs/common";
import { Investor, PaginatedData } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { paginate } from "src/shared/helpers";
import { sort } from "fast-sort";
import { GraphRepository } from "src/postgres/graph.repository";
import { PostgresService } from "src/postgres/postgres.service";

export interface FundListItem {
  id: string;
  name: string;
  normalizedName: string;
  logoUrl: string | null;
  website: string | null;
  twitter: string | null;
  staffCount: number;
  portfolioCount: number;
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
}

@Injectable()
export class InvestorsService {
  private readonly logger = new CustomLogger(InvestorsService.name);
  constructor(
    private readonly graph: GraphRepository,
    private readonly postgres: PostgresService,
  ) {}

  async getFundList(
    page: number,
    limit: number,
  ): Promise<PaginatedData<FundListItem>> {
    const safePage = Math.max(1, Math.trunc(page));
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const offset = (safePage - 1) * safeLimit;
    const rows = await this.postgres.query<{
      payload: FundListItem;
      total: string;
    }>(
      `
        SELECT jsonb_build_object(
          'id', fund.properties ->> 'id',
          'name', fund.properties ->> 'name',
          'normalizedName', fund.properties ->> 'normalizedName',
          'logoUrl', fund.properties ->> 'logoUrl',
          'website', related.website,
          'twitter', related.twitter,
          'staffCount', related.staff_count,
          'portfolioCount', related.portfolio_count
        ) AS payload,
        count(*) OVER ()::text AS total
        FROM graph_nodes fund
        CROSS JOIN LATERAL (
          SELECT
            min(node.properties ->> 'url')
              FILTER (WHERE edge.type = 'HAS_WEBSITE') AS website,
            min(node.properties ->> 'username')
              FILTER (WHERE edge.type = 'HAS_TWITTER') AS twitter,
            count(*) FILTER (WHERE edge.type = 'HAS_STAFF')::int AS staff_count,
            (
              SELECT count(DISTINCT owner.source_id)::int
              FROM graph_relationships investment
              JOIN graph_relationships owner
                ON owner.target_id = investment.source_id
               AND owner.type = 'HAS_FUNDING_ROUND'
              WHERE investment.target_id = fund.id
                AND investment.type = 'HAS_INVESTOR'
            ) AS portfolio_count
          FROM graph_relationships edge
          JOIN graph_nodes node ON node.id = edge.target_id
          WHERE edge.source_id = fund.id
        ) related
        WHERE fund.label = 'Investor'
          AND lower(COALESCE(fund.properties ->> 'isFund', 'false'))
              IN ('true', '1', 'yes', 'on')
        ORDER BY lower(fund.properties ->> 'name'), fund.id
        LIMIT $1 OFFSET $2
      `,
      [safeLimit, offset],
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
          'team', related.team,
          'investments', related.investments
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
                    'linkedinUrl', staff.properties ->> 'linkedinUrl',
                    'twitterUrl', staff.properties ->> 'twitterUrl'
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
