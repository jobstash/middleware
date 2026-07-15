import { Injectable } from "@nestjs/common";
import { Investor, PaginatedData } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { paginate } from "src/shared/helpers";
import { sort } from "fast-sort";
import { GraphRepository } from "src/postgres/graph.repository";

@Injectable()
export class InvestorsService {
  private readonly logger = new CustomLogger(InvestorsService.name);
  constructor(private readonly graph: GraphRepository) {}

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
