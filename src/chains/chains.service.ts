import { Injectable } from "@nestjs/common";
import { Chain, PaginatedData } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { paginate } from "src/shared/helpers";
import { sort } from "fast-sort";
import { GraphRepository } from "src/postgres/graph.repository";

@Injectable()
export class ChainsService {
  private readonly logger = new CustomLogger(ChainsService.name);
  constructor(private readonly graph: GraphRepository) {}

  async getChainList(
    page: number,
    limit: number,
  ): Promise<PaginatedData<Chain>> {
    try {
      const chains =
        await this.graph.findNodes<Record<string, unknown>>("Chain");

      return paginate(
        page,
        limit,
        sort<Chain>(
          chains.map(chain => new Chain(chain.properties as unknown as Chain)),
        ).asc(x => x.name),
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "chains.service",
        });
        scope.setExtra("input", { page, limit });
        Sentry.captureException(err);
      });
      this.logger.error(`ChainsService::getChainList ${err.message}`);
      return {
        page: -1,
        total: 0,
        count: 0,
        data: [],
      };
    }
  }

  async getChainDetailsBySlug(slug: string): Promise<Chain | undefined> {
    try {
      const chain = await this.graph.findNode<Record<string, unknown>>(
        "Chain",
        {
          normalizedName: slug,
        },
      );
      return chain
        ? new Chain(chain.properties as unknown as Chain)
        : undefined;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "chains.service",
        });
        scope.setExtra("input", slug);
        Sentry.captureException(err);
      });
      this.logger.error(`ChainsService::getChainDetailsBySlug ${err.message}`);
      return undefined;
    }
  }
}
