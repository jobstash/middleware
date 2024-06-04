import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { Investor, PaginatedData } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { paginate } from "src/shared/helpers";
import { sort } from "fast-sort";

@Injectable()
export class InvestorsService {
  private readonly logger = new CustomLogger(InvestorsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  async getInvestorList(
    page: number,
    limit: number,
  ): Promise<PaginatedData<Investor>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (investor:Investor)
        RETURN investor { .* } as investor
        `,
      );

      return paginate(
        page,
        limit,
        sort<Investor>(
          result.records.map(res => new Investor(res.get("investor"))),
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
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (investor:Investor)
          WHERE investor.normalizedName = $slug
          RETURN investor { .* } as investor
        `,
        { slug },
      );

      return new Investor(result.records[0].get("investor"));
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
