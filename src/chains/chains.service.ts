import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { Chain, PaginatedData } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { paginate } from "src/shared/helpers";
import { sort } from "fast-sort";

@Injectable()
export class ChainsService {
  private readonly logger = new CustomLogger(ChainsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  async getChainList(
    page: number,
    limit: number,
  ): Promise<PaginatedData<Chain>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = pipelined
        MATCH (chain:Chain)
        RETURN chain { .* } as chain
        `,
      );

      return paginate(
        page,
        limit,
        sort<Chain>(result.records.map(res => new Chain(res.get("chain")))).asc(
          x => x.name,
        ),
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
      const result = await this.neogma.queryRunner.run(
        `
          CYPHER runtime = pipelined
          MATCH (chain:Chain)
          WHERE chain.normalizedName = $slug
          RETURN chain { .* } as chain
        `,
        { slug },
      );

      return new Chain(result.records[0].get("chain"));
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
