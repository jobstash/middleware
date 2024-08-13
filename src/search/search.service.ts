import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { SearchResult, SearchResultItem } from "src/shared/interfaces";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { uniqBy } from "lodash";

@Injectable()
export class SearchService {
  private readonly logger = new CustomLogger(SearchService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  private async searchProjects(query: string): Promise<SearchResultItem[]> {
    const result = await this.neogma.queryRunner.run(
      `
        CALL db.index.fulltext.queryNodes("projects", $query) YIELD node as project
        RETURN project.name as name
      `,
      { query },
    );
    return uniqBy(
      result.records.map(record => ({
        value: record.get("name"),
        link: "",
      })),
      "value",
    );
  }

  private async searchProjectCategories(
    query: string,
  ): Promise<SearchResultItem[]> {
    const result = await this.neogma.queryRunner.run(
      `
        CALL db.index.fulltext.queryNodes("projectCategories", $query) YIELD node as projectCategory
        RETURN projectCategory.name as name
      `,
      { query },
    );
    return uniqBy(
      result.records.map(record => ({
        value: record.get("name"),
        link: "",
      })),
      "value",
    );
  }

  private async searchSkills(query: string): Promise<SearchResultItem[]> {
    const result = await this.neogma.queryRunner.run(
      `
        CALL db.index.fulltext.queryNodes("tagNames", $query) YIELD node as skill
        RETURN skill.name as name
      `,
      { query },
    );
    return uniqBy(
      result.records.map(record => ({
        value: record.get("name"),
        link: "",
      })),
      "value",
    );
  }

  private async searchOrganizations(
    query: string,
  ): Promise<SearchResultItem[]> {
    const result = await this.neogma.queryRunner.run(
      `
        CALL db.index.fulltext.queryNodes("organizations", $query) YIELD node as organization
        RETURN organization.name as name
      `,
      { query },
    );
    return uniqBy(
      result.records.map(record => ({
        value: record.get("name"),
        link: "",
      })),
      "value",
    );
  }

  private async searchGrants(query: string): Promise<SearchResultItem[]> {
    const result = await this.neogma.queryRunner.run(
      `
        CALL db.index.fulltext.queryNodes("grants", $query) YIELD node as grant
        RETURN grant.name as name
      `,
      { query },
    );
    return uniqBy(
      result.records.map(record => ({
        value: record.get("name"),
        link: "",
      })),
      "value",
    );
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
        link: "",
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
        link: "",
      })),
      "value",
    );
  }

  async search(query: string): Promise<SearchResult> {
    try {
      const [
        projects,
        skills,
        organizations,
        projectCategories,
        grants,
        investors,
        fundingRounds,
      ] = await Promise.all([
        this.searchProjects(query),
        this.searchSkills(query),
        this.searchOrganizations(query),
        this.searchProjectCategories(query),
        this.searchGrants(query),
        this.searchInvestors(query),
        this.searchFundingRounds(query),
      ]);
      return {
        projects,
        skills,
        organizations,
        projectCategories,
        grants,
        investors,
        fundingRounds,
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
        projects: [],
        skills: [],
        organizations: [],
        projectCategories: [],
        grants: [],
        investors: [],
        fundingRounds: [],
      };
    }
  }
}
