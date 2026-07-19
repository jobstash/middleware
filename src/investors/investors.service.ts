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

  async getFundDetailsBySlug(slug: string): Promise<FundListItem | undefined> {
    const rows = await this.postgres.query<{ payload: FundListItem }>(
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
        ) AS payload
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
          AND fund.properties ->> 'normalizedName' = $1
          AND lower(COALESCE(fund.properties ->> 'isFund', 'false'))
              IN ('true', '1', 'yes', 'on')
        ORDER BY fund.id
        LIMIT 1
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
