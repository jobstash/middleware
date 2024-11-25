import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import {
  SearchResult,
  SearchResultItem,
  SearchResultPillar,
} from "src/shared/interfaces";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { uniqBy } from "lodash";
import { sluggify } from "src/shared/helpers";

@Injectable()
export class SearchService {
  private readonly logger = new CustomLogger(SearchService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  private async searchVCs(query: string): Promise<SearchResultPillar> {
    const names = await this.neogma.queryRunner.run(
      `
          CALL db.index.fulltext.queryNodes("investors", $query) YIELD node as vc
          RETURN vc.name as name
        `,
      { query },
    );

    return {
      names: uniqBy(
        names.records.map(record => ({
          value: record.get("name"),
          link: `/projects/names/${sluggify(record.get("name"))}`,
        })),
        "value",
      ),
    };
  }

  private async searchProjects(query: string): Promise<SearchResultPillar> {
    const [names, categories, tags] = await Promise.all([
      this.neogma.queryRunner.run(
        `
          CALL db.index.fulltext.queryNodes("projects", $query) YIELD node as project
          RETURN project.name as name
        `,
        { query },
      ),
      this.neogma.queryRunner.run(
        `
          CALL db.index.fulltext.queryNodes("projectCategories", $query) YIELD node as projectCategory
          RETURN projectCategory.name as name
        `,
        { query },
      ),
      this.searchTags(query, "projects"),
    ]);

    return {
      names: uniqBy(
        names.records.map(record => ({
          value: record.get("name"),
          link: `/projects/names/${sluggify(record.get("name"))}`,
        })),
        "value",
      ),
      categories: uniqBy(
        categories.records.map(record => ({
          value: record.get("name"),
          link: `/projects/categories/${sluggify(record.get("name"))}`,
        })),
        "value",
      ),
      tags,
    };
  }

  private async searchTags(
    query: string,
    group: "projects" | "organizations",
  ): Promise<SearchResultItem[]> {
    const result = await this.neogma.queryRunner.run(
      `
          CALL db.index.fulltext.queryNodes("tagNames", $query) YIELD node as tag
          RETURN tag.name as name
        `,
      { query },
    );

    return uniqBy(
      result.records.map(record => ({
        value: record.get("name"),
        link: `/${group}/tags/${sluggify(record.get("name"))}`,
      })),
      "value",
    );
  }

  private async searchOrganizations(
    query: string,
  ): Promise<SearchResultPillar> {
    const [names, investors, fundingRounds, tags] = await Promise.all([
      this.neogma.queryRunner.run(
        `
          CALL db.index.fulltext.queryNodes("organizations", $query) YIELD node as organization
          RETURN organization.name as name
        `,
        { query },
      ),
      this.searchInvestors(query),
      this.searchFundingRounds(query),
      this.searchTags(query, "organizations"),
    ]);

    return {
      names: uniqBy(
        names.records.map(record => ({
          value: record.get("name"),
          link: `/organizations/names/${sluggify(record.get("name"))}`,
        })),
        "value",
      ),
      investors,
      fundingRounds,
      tags,
    };
  }

  private async searchGrants(
    query: string,
    status: "active" | "inactive",
  ): Promise<SearchResultPillar> {
    const statusFilter = status === "active" ? "ACTIVE" : "INACTIVE";
    const [names, ecosystems, chains, categories, organizations] =
      await Promise.all([
        await this.neogma.queryRunner.run(
          `
          CALL db.index.fulltext.queryNodes("grants", $query) YIELD node as grant
          WHERE (grant)-[:HAS_STATUS]->(:KarmaGapGrantStatus {name: $statusFilter})
          RETURN grant.name as name
        `,
          { query, statusFilter },
        ),
        await this.neogma.queryRunner.run(
          `
          CALL db.index.fulltext.queryNodes("grantEcosystems", $query) YIELD node as ecosystem
          RETURN ecosystem.name as ecosystem
        `,
          { query, statusFilter },
        ),
        this.neogma.queryRunner.run(
          `
          CALL db.index.fulltext.queryNodes("grantChains", $query) YIELD node as chain
          RETURN chain.name as chain
        `,
          { query, statusFilter },
        ),
        this.neogma.queryRunner.run(
          `
          CALL db.index.fulltext.queryNodes("grantCategories", $query) YIELD node as category
          RETURN category.name as category
        `,
          { query, statusFilter },
        ),
        this.neogma.queryRunner.run(
          `
          CALL db.index.fulltext.queryNodes("grantOrganizations", $query) YIELD node as organization
          RETURN organization.name as organization
        `,
          { query, statusFilter },
        ),
      ]);

    return {
      names: uniqBy(
        names.records.map(record => ({
          value: record.get("name"),
          link: `/grants/names/${sluggify(record.get("name"))}`,
        })),
        "value",
      ),
      ecosystems: uniqBy(
        ecosystems.records.map(record => ({
          value: record.get("ecosystem"),
          link: `/grants/ecosystems/${sluggify(record.get("ecosystem"))}`,
        })),
        "value",
      ),
      chains: uniqBy(
        chains.records.map(record => ({
          value: record.get("chain"),
          link: `/grants/chains/${sluggify(record.get("chain"))}`,
        })),
        "value",
      ),
      categories: uniqBy(
        categories.records.map(record => ({
          value: record.get("category"),
          link: `/grants/categories/${sluggify(record.get("category"))}`,
        })),
        "value",
      ),
      organizations: uniqBy(
        organizations.records.map(record => ({
          value: record.get("organization"),
          link: `/grants/organizations/${sluggify(record.get("organization"))}`,
        })),
        "value",
      ),
    };
  }

  private async searchInvestors(query: string): Promise<SearchResultItem[]> {
    const result = await this.neogma.queryRunner.run(
      `
        CALL db.index.fulltext.queryNodes("investors", $query) YIELD node as investor
        RETURN investor.name as name
      `,
      { query },
    );
    return uniqBy(
      result.records.map(record => ({
        value: record.get("name"),
        link: `/organizations/investors/${sluggify(record.get("name"))}`,
      })),
      "value",
    );
  }

  private async searchFundingRounds(
    query: string,
  ): Promise<SearchResultItem[]> {
    const result = await this.neogma.queryRunner.run(
      `
        CALL db.index.fulltext.queryNodes("rounds", $query) YIELD node as fundingRound
        RETURN fundingRound.roundName as name
      `,
      { query },
    );
    return uniqBy(
      result.records.map(record => ({
        value: record.get("name"),
        link: `/organizations/funding-rounds/${sluggify(record.get("name"))}`,
      })),
      "value",
    );
  }

  async search(query: string): Promise<SearchResult> {
    try {
      if (!query || query.length === 0) {
        return {
          projects: {
            names: [],
          },
          organizations: {
            names: [],
          },
          grants: {
            names: [],
          },
          grantsImpact: {
            names: [],
          },
          vcs: {
            names: [],
          },
        };
      }
      const [projects, organizations, grants, grantsImpact, vcs] =
        await Promise.all([
          this.searchProjects(query),
          this.searchOrganizations(query),
          this.searchGrants(query, "active"),
          this.searchGrants(query, "inactive"),
          this.searchVCs(query),
        ]);
      return {
        projects,
        organizations,
        grants,
        grantsImpact,
        vcs,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "tags.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`SearchService::search ${err.message}`);
      return {
        projects: {
          names: [],
        },
        organizations: {
          names: [],
        },
        grants: {
          names: [],
        },
        grantsImpact: {
          names: [],
        },
        vcs: {
          names: [],
        },
      };
    }
  }
}
