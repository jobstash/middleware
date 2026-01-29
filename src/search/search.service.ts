import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { go } from "fuzzysort";
import { capitalize, lowerCase, max, min, uniq, uniqBy } from "lodash";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import {
  defaultSort,
  intConverter,
  isValidFilterConfig,
  paginate,
  slugify,
} from "src/shared/helpers";
import { subDays, startOfDay, endOfDay } from "date-fns";
import {
  PillarPageData,
  PillarJob,
  ParsedPillarSlug,
  SuggestedPillar,
} from "./dto/pillar-page.output";
import {
  SuggestionItem,
  GroupInfo,
  SuggestionsResponse,
} from "./dto/job-suggestions.output";
import { SkillSuggestionsInput } from "./dto/skill-suggestions.input";
import {
  SkillSuggestionItem,
  SkillSuggestionsData,
} from "./dto/skill-suggestions.output";
import {
  JobSuggestionsInput,
  SuggestionGroupId,
  SUGGESTION_GROUPS,
} from "./dto/job-suggestions.input";
import {
  MultiSelectFilter,
  PaginatedData,
  Pillar,
  PillarInfo,
  ResponseWithOptionalData,
  SearchNav,
  SearchRangeFilter,
  SearchResult,
  SearchResultItem,
  SearchResultNav,
  SingleSelectFilter,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { SearchPillarItemParams } from "./dto/search-pillar-items.input";
import { SearchPillarParams } from "./dto/search-pillar.input";
import { FetchPillarItemLabelsInput } from "./dto/fetch-pillar-item-labels.input";
import { SearchParams } from "./dto/search.input";
import { QueryResult } from "neo4j-driver-core";
import { int } from "neo4j-driver";
import { SearchPillarFiltersParams } from "./dto/search-pillar-filters-params.input";
import {
  FILTER_CONFIG_PRESETS,
  FILTER_PARAM_KEY_PRESETS,
  FILTER_PARAM_KEY_REVERSE_PRESETS,
} from "src/shared/presets/search-filter-configs";
import {
  NAV_PILLAR_ORDERING,
  NAV_PILLAR_TITLES,
  NAV_FILTER_CONFIG_QUERY_MAPPINGS,
  NAV_PILLAR_QUERY_MAPPINGS,
  NAV_FILTER_CONFIGS,
  NAV_FILTER_LABEL_MAPPINGS,
  NAV_PILLAR_SLUG_PREFIX_MAPPINGS,
} from "src/shared/constants";

@Injectable()
export class SearchService {
  private readonly logger = new CustomLogger(SearchService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  private async searchVCs(query: string): Promise<SearchResultNav> {
    if (query) {
      const names = await this.neogma.queryRunner.run(
        `
          CALL db.index.fulltext.queryNodes("investors", $query) YIELD node as vc, score
          RETURN DISTINCT vc.name as name, score
          ORDER BY score DESC
          LIMIT 10
        `,
        { query },
      );

      return {
        names: uniqBy(
          names.records?.map(record => ({
            value: record.get("name"),
            link: `/projects/names/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
      };
    } else {
      const names = await this.neogma.queryRunner.run(
        `
          MATCH (i:Investor)<-[:HAS_INVESTOR]-(f:FundingRound)
          WITH i.name as name, COUNT(DISTINCT f) as popularity
          RETURN name
          ORDER BY popularity DESC
          LIMIT 10
        `,
      );

      return {
        names: uniqBy(
          names.records?.map(record => ({
            value: record.get("name"),
            link: `/projects/names/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
      };
    }
  }

  private async searchProjects(query: string): Promise<SearchResultNav> {
    if (query) {
      const [names, categories, organizations, chains, investors, tags] =
        await Promise.all([
          this.neogma.queryRunner.run(
            `
          CALL db.index.fulltext.queryNodes("projects", $query) YIELD node as project, score
          RETURN DISTINCT project.name as name, score
          ORDER BY score DESC
          LIMIT 10
        `,
            { query },
          ),
          this.neogma.queryRunner.run(
            `
          CALL db.index.fulltext.queryNodes("projectCategories", $query) YIELD node as projectCategory, score
          RETURN DISTINCT projectCategory.name as name, score
          ORDER BY score DESC
          LIMIT 10
        `,
            { query },
          ),
          this.neogma.queryRunner.run(
            `
          CALL db.index.fulltext.queryNodes("organizations", $query) YIELD node as organization, score
          WHERE (organization)-[:HAS_PROJECT]->(:Project)
          RETURN DISTINCT organization.name as name, score
          ORDER BY score DESC
          LIMIT 10
        `,
            { query },
          ),
          this.searchChains(query, "projects"),
          this.searchInvestors(query, "projects"),
          this.searchTags(query, "projects"),
        ]);
      return {
        categories: uniqBy(
          categories.records?.map(record => ({
            value: record.get("name"),
            link: `/projects/categories/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        chains,
        organizations: uniqBy(
          organizations.records?.map(record => ({
            value: record.get("name"),
            link: `/projects/organizations/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        investors,
        names: uniqBy(
          names.records?.map(record => ({
            value: record.get("name"),
            link: `/projects/names/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        tags,
      };
    } else {
      const [names, categories, organizations, chains, investors, tags] =
        await Promise.all([
          this.neogma.queryRunner.run(
            `
          CYPHER runtime = parallel
          MATCH (p:Project)
          RETURN DISTINCT p.name as name, p
          ORDER BY p.createdTimestamp DESC
          LIMIT 10
        `,
          ),
          this.neogma.queryRunner.run(
            `
          CYPHER runtime = parallel
          MATCH (c:ProjectCategory)
          MATCH (c)<-[:HAS_CATEGORY]-(p:Project)
          WITH c.name as name
          RETURN DISTINCT name, COUNT(name) as popularity
          ORDER BY popularity DESC
          LIMIT 10
        `,
          ),
          this.neogma.queryRunner.run(
            `
          CYPHER runtime = parallel
          MATCH (o:Organization)-[:HAS_PROJECT]->(:Project)
          RETURN DISTINCT o.name as name, o
          ORDER BY o.createdTimestamp DESC
          LIMIT 10
        `,
          ),
          this.searchChains(query, "projects"),
          this.searchInvestors(query, "projects"),
          this.searchTags(query, "projects"),
        ]);
      return {
        categories: uniqBy(
          categories.records?.map(record => ({
            value: record.get("name"),
            link: `/projects/categories/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        chains,
        organizations: uniqBy(
          organizations.records?.map(record => ({
            value: record.get("name"),
            link: `/projects/organizations/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        investors,
        names: uniqBy(
          names.records?.map(record => ({
            value: record.get("name"),
            link: `/projects/names/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        tags,
      };
    }
  }

  private async searchTags(
    query: string,
    group: "projects" | "organizations",
  ): Promise<SearchResultItem[]> {
    let result: QueryResult;

    if (group === "projects") {
      if (query) {
        result = await this.neogma.queryRunner.run(
          `
          CALL db.index.fulltext.queryNodes("tagNames", $query) YIELD node as tag
          WHERE (:Project)<-[:HAS_PROJECT|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*5]->(tag)
          AND NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation)
          AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
          WITH DISTINCT tag
          OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
          OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
          WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others
          WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag
          WITH DISTINCT canonicalTag as tag
          RETURN tag.name as name
        `,
          { query },
        );
      } else {
        result = await this.neogma.queryRunner.run(
          `
          CYPHER runtime = parallel
          MATCH (:Project)<-[:HAS_PROJECT|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*5]->(t:Tag)
          WHERE NOT (t)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation)
          AND NOT (t)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
          WITH DISTINCT t
          OPTIONAL MATCH (t)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
          OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(t)-[:IS_PAIR_OF]->(pair:Tag)
          WITH t, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others
          WITH CASE WHEN size(others) > 0 THEN head(others) ELSE t END AS canonicalTag
          WITH DISTINCT canonicalTag.name as name
          RETURN name, COUNT(name) as popularity
          ORDER BY popularity DESC
          LIMIT 10
        `,
        );
      }
    } else {
      if (query) {
        result = await this.neogma.queryRunner.run(
          `
          CALL db.index.fulltext.queryNodes("tagNames", $query) YIELD node as tag
          WHERE (:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag)
          AND NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation)
          AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
          WITH DISTINCT tag
          OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
          OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
          WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others
          WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag
          WITH DISTINCT canonicalTag as tag
          RETURN tag.name as name
        `,
          { query },
        );
      } else {
        result = await this.neogma.queryRunner.run(
          `
          CYPHER runtime = parallel
          MATCH (o:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(t:Tag)
          WHERE NOT (t)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation)
          AND NOT (t)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
          WITH DISTINCT t
          OPTIONAL MATCH (t)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
          OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(t)-[:IS_PAIR_OF]->(pair:Tag)
          WITH t, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others
          WITH CASE WHEN size(others) > 0 THEN head(others) ELSE t END AS canonicalTag
          WITH DISTINCT canonicalTag.name as name
          RETURN name, COUNT(name) as popularity
          ORDER BY popularity DESC
          LIMIT 10
        `,
        );
      }
    }

    return uniqBy(
      (result.records?.map(record => ({
        value: record.get("name"),
        link: `/${group}/tags/${slugify(record.get("name"))}`,
      })) as SearchResultItem[]) ?? [],
      "value",
    );
  }

  private async searchOrganizations(query: string): Promise<SearchResultNav> {
    if (query) {
      const [
        names,
        locations,
        projects,
        investors,
        fundingRounds,
        chains,
        tags,
      ] = await Promise.all([
        this.neogma.queryRunner.run(
          `
          CALL db.index.fulltext.queryNodes("organizations", $query) YIELD node as organization, score
          RETURN DISTINCT organization.name as name, score
          ORDER BY score DESC
          LIMIT 10
        `,
          { query },
        ),
        this.neogma.queryRunner.run(
          `
          CALL db.index.fulltext.queryNodes("organizationLocations", $query) YIELD node as organization, score
          RETURN DISTINCT organization.location as location, score
          ORDER BY score DESC
          LIMIT 10
        `,
          { query },
        ),
        this.neogma.queryRunner.run(
          `
          CALL db.index.fulltext.queryNodes("projects", $query) YIELD node as project, score
          WHERE (:Organization)-[:HAS_PROJECT]->(project)
          RETURN DISTINCT project.name as name, score
          ORDER BY score DESC
          LIMIT 10
        `,
          { query },
        ),
        this.searchInvestors(query, "organizations"),
        this.searchFundingRounds(query),
        this.searchChains(query, "organizations"),
        this.searchTags(query, "organizations"),
      ]);

      return {
        investors,
        locations: uniqBy(
          locations.records?.map(record => ({
            value: record.get("location"),
            link: `/organizations/locations/${slugify(record.get("location"))}`,
          })) ?? [],
          "value",
        ),
        projects: uniqBy(
          projects.records?.map(record => ({
            value: record.get("name"),
            link: `/organizations/projects/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        chains,
        fundingRounds,
        names: uniqBy(
          names.records?.map(record => ({
            value: record.get("name"),
            link: `/organizations/names/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        tags,
      };
    } else {
      const [
        names,
        locations,
        projects,
        investors,
        fundingRounds,
        chains,
        tags,
      ] = await Promise.all([
        this.neogma.queryRunner.run(
          `
          CYPHER runtime = parallel
          MATCH (o:Organization)
          RETURN DISTINCT o.name as name, o
          ORDER BY o.createdTimestamp DESC
          LIMIT 10
        `,
        ),
        this.neogma.queryRunner.run(
          `
          CYPHER runtime = parallel
          MATCH (o:Organization)
          WITH o.location as location
          RETURN DISTINCT location, COUNT(location) AS popularity
          ORDER BY popularity  DESC
          LIMIT 10
        `,
        ),
        this.neogma.queryRunner.run(
          `
          CYPHER runtime = parallel
          MATCH (:Organization)-[:HAS_PROJECT]->(p:Project)
          RETURN DISTINCT p.name as name, p
          ORDER BY p.createdTimestamp DESC
          LIMIT 10
        `,
        ),
        this.searchInvestors(query, "organizations"),
        this.searchFundingRounds(query),
        this.searchChains(query, "organizations"),
        this.searchTags(query, "organizations"),
      ]);

      return {
        investors,
        locations: uniqBy(
          locations.records?.map(record => ({
            value: record.get("location"),
            link: `/organizations/locations/${slugify(record.get("location"))}`,
          })) ?? [],
          "value",
        ),
        projects: uniqBy(
          projects.records?.map(record => ({
            value: record.get("name"),
            link: `/organizations/projects/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        chains,
        fundingRounds,
        names: uniqBy(
          names.records?.map(record => ({
            value: record.get("name"),
            link: `/organizations/names/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        tags,
      };
    }
  }

  private async searchGrants(
    query: string,
    status: "active" | "inactive",
  ): Promise<SearchResultNav> {
    const statusFilter = status === "active" ? "Active" : "Inactive";
    const name = status === "active" ? "grants" : "impact";

    if (query) {
      const [names, ecosystems, chains, categories, organizations] =
        await Promise.all([
          this.neogma.queryRunner.run(
            `
          CALL db.index.fulltext.queryNodes("grants", $query) YIELD node as grant, score
          WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN DISTINCT grant.name as name, score
          ORDER BY score DESC
          LIMIT 10
        `,
            { query, statusFilter },
          ),
          this.neogma.queryRunner.run(
            `
          CALL db.index.fulltext.queryNodes("grantEcosystems", $query) YIELD node as ecosystem, score
          WHERE (ecosystem)<-[:HAS_METADATA|HAS_ECOSYSTEM*2]-(:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN DISTINCT ecosystem.name as ecosystem, score
          ORDER BY score DESC
          LIMIT 10
        `,
            { query, statusFilter },
          ),
          this.neogma.queryRunner.run(
            `
          CALL db.index.fulltext.queryNodes("grantChains", $query) YIELD node as chain, score
          WHERE (chain)<-[:HAS_METADATA|HAS_NETWORK*2]-(:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN DISTINCT chain.name as chain, score
          ORDER BY score DESC
          LIMIT 10
        `,
            { query, statusFilter },
          ),
          this.neogma.queryRunner.run(
            `
          CALL db.index.fulltext.queryNodes("grantCategories", $query) YIELD node as category, score
          WHERE (category)<-[:HAS_METADATA|HAS_CATEGORY*2]-(:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN DISTINCT category.name as category, score
          ORDER BY score DESC
          LIMIT 10
        `,
            { query, statusFilter },
          ),
          this.neogma.queryRunner.run(
            `
          CALL db.index.fulltext.queryNodes("grantOrganizations", $query) YIELD node as organization, score
          WHERE (organization)<-[:HAS_METADATA|HAS_ORGANIZATION*2]-(:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN DISTINCT organization.name as organization, score
          ORDER BY score DESC
          LIMIT 10
        `,
            { query, statusFilter },
          ),
        ]);

      return {
        categories: uniqBy(
          categories.records?.map(record => ({
            value: record.get("category"),
            link: `/${name}/categories/${slugify(record.get("category"))}`,
          })) ?? [],
          "value",
        ),
        chains: uniqBy(
          chains.records?.map(record => ({
            value: record.get("chain"),
            link: `/${name}/chains/${slugify(record.get("chain"))}`,
          })) ?? [],
          "value",
        ),
        ecosystems: uniqBy(
          ecosystems.records?.map(record => ({
            value: record.get("ecosystem"),
            link: `/${name}/ecosystems/${slugify(record.get("ecosystem"))}`,
          })) ?? [],
          "value",
        ),
        organizations: uniqBy(
          organizations.records?.map(record => ({
            value: record.get("organization"),
            link: `/${name}/organizations/${slugify(
              record.get("organization"),
            )}`,
          })) ?? [],
          "value",
        ),
        names: uniqBy(
          names.records?.map(record => ({
            value: record.get("name"),
            link: `/${name}/names/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
      };
    } else {
      const [names, ecosystems, chains, categories, organizations] =
        await Promise.all([
          this.neogma.queryRunner.run(
            `
          CYPHER runtime = parallel
          MATCH (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)
          WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          WITH grant.name as name
          RETURN DISTINCT name, COUNT(name) as popularity
          ORDER BY popularity DESC
          LIMIT 10
        `,
            { statusFilter },
          ),
          this.neogma.queryRunner.run(
            `
          CYPHER runtime = parallel
          MATCH (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)-[:HAS_ECOSYSTEM]->(ecosystem:KarmaGapEcosystem)
          WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          WITH ecosystem.name as ecosystem
          RETURN DISTINCT ecosystem, COUNT(ecosystem) as popularity
          ORDER BY popularity DESC
          LIMIT 10
        `,
            { statusFilter },
          ),
          this.neogma.queryRunner.run(
            `
          CYPHER runtime = parallel
          MATCH (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)-[:HAS_NETWORK]->(chain:KarmaGapNetwork)
          WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          WITH chain.name as chain
          RETURN DISTINCT chain, COUNT(chain) as popularity
          ORDER BY popularity DESC
          LIMIT 10
        `,
            { statusFilter },
          ),
          this.neogma.queryRunner.run(
            `
          CYPHER runtime = parallel
          MATCH (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)-[:HAS_CATEGORY]->(category:KarmaGapCategory)
          WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          WITH category.name as category
          RETURN DISTINCT category, COUNT(category) as popularity
          ORDER BY popularity DESC
          LIMIT 10
        `,
            { statusFilter },
          ),
          this.neogma.queryRunner.run(
            `
          CYPHER runtime = parallel
          MATCH (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)-[:HAS_ORGANIZATION]->(organization:KarmaGapOrganization)
          WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          WITH organization.name as organization
          RETURN DISTINCT organization, COUNT(organization) as popularity
          ORDER BY popularity DESC
          LIMIT 10
        `,
            { statusFilter },
          ),
        ]);

      return {
        categories: uniqBy(
          categories.records?.map(record => ({
            value: record.get("category"),
            link: `/${name}/categories/${slugify(record.get("category"))}`,
          })) ?? [],
          "value",
        ),
        chains: uniqBy(
          chains.records?.map(record => ({
            value: record.get("chain"),
            link: `/${name}/chains/${slugify(record.get("chain"))}`,
          })) ?? [],
          "value",
        ),
        ecosystems: uniqBy(
          ecosystems.records?.map(record => ({
            value: record.get("ecosystem"),
            link: `/${name}/ecosystems/${slugify(record.get("ecosystem"))}`,
          })) ?? [],
          "value",
        ),
        organizations: uniqBy(
          organizations.records?.map(record => ({
            value: record.get("organization"),
            link: `/${name}/organizations/${slugify(
              record.get("organization"),
            )}`,
          })) ?? [],
          "value",
        ),
        names: uniqBy(
          names.records?.map(record => ({
            value: record.get("name"),
            link: `/${name}/names/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
      };
    }
  }

  private async searchInvestors(
    query: string,
    name: "organizations" | "projects",
  ): Promise<SearchResultItem[]> {
    if (query) {
      let result: QueryResult;
      if (name === "organizations") {
        result = await this.neogma.queryRunner.run(
          `
            CALL db.index.fulltext.queryNodes("investors", $query) YIELD node as investor, score
            WHERE (:Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor)
            RETURN DISTINCT investor.name as name, score
            ORDER BY score DESC
            LIMIT 10
          `,
          { query },
        );
      } else {
        result = await this.neogma.queryRunner.run(
          `
            CALL db.index.fulltext.queryNodes("investors", $query) YIELD node as investor, score
            WHERE (:Project)<-[:HAS_PROJECT]-(:Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor)
            RETURN DISTINCT investor.name as name, score
            ORDER BY score DESC
            LIMIT 10
          `,
          { query },
        );
      }

      return uniqBy(
        result.records?.map(record => ({
          value: record.get("name"),
          link: `/${name}/investors/${slugify(record.get("name"))}`,
        })) ?? [],
        "value",
      );
    } else {
      let result: QueryResult;
      if (name === "organizations") {
        result = await this.neogma.queryRunner.run(
          `
        CYPHER runtime = parallel
        MATCH (:Organization)-[:HAS_FUNDING_ROUND]->(f:FundingRound)-[:HAS_INVESTOR]->(i:Investor)
        WITH i.name as name, f
        RETURN DISTINCT name, COUNT(f) as popularity
        ORDER BY popularity DESC
        LIMIT 10
      `,
          { query },
        );
      } else {
        result = await this.neogma.queryRunner.run(
          `
        CYPHER runtime = parallel
        MATCH (:Project)<-[:HAS_PROJECT]-(:Organization)-[:HAS_FUNDING_ROUND]->(f:FundingRound)-[:HAS_INVESTOR]->(i:Investor)
        WITH i.name as name, f
        RETURN DISTINCT name, COUNT(f) as popularity
        ORDER BY popularity DESC
        LIMIT 10
      `,
          { query },
        );
      }
      return uniqBy(
        result.records?.map(record => ({
          value: record.get("name"),
          link: `/${name}/investors/${slugify(record.get("name"))}`,
        })) ?? [],
        "value",
      );
    }
  }

  private async searchFundingRounds(
    query: string,
  ): Promise<SearchResultItem[]> {
    if (query) {
      const result = await this.neogma.queryRunner.run(
        `
        CALL db.index.fulltext.queryNodes("rounds", $query) YIELD node as fundingRound, score
        RETURN DISTINCT fundingRound.roundName as name, score
        ORDER BY score DESC
        LIMIT 10
      `,
        { query },
      );
      return uniqBy(
        result.records?.map(record => ({
          value: record.get("name"),
          link: `/organizations/funding-rounds/${slugify(record.get("name"))}`,
        })) ?? [],
        "value",
      );
    } else {
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = parallel
        MATCH (f:FundingRound)<-[:HAS_FUNDING_ROUND]-(o:Organization)
        WITH f.roundName as name, o
        RETURN DISTINCT name, COUNT(o) as popularity
        ORDER BY popularity DESC
        LIMIT 10
      `,
      );
      return uniqBy(
        result.records?.map(record => ({
          value: record.get("name"),
          link: `/organizations/funding-rounds/${slugify(record.get("name"))}`,
        })) ?? [],
        "value",
      );
    }
  }

  async searchChains(
    query: string,
    group: "projects" | "organizations",
  ): Promise<SearchResultItem[]> {
    let result: QueryResult;

    if (group === "projects") {
      if (query) {
        result = await this.neogma.queryRunner.run(
          `
          CALL db.index.fulltext.queryNodes("chains", $query) YIELD node as chain, score
          RETURN DISTINCT chain.name as name, score
          ORDER BY score DESC
          LIMIT 10
        `,
          { query },
        );
      } else {
        result = await this.neogma.queryRunner.run(
          `
          CYPHER runtime = parallel
          MATCH (c:Chain)
          MATCH (c)<-[:IS_DEPLOYED_ON]-(p:Project)
          WITH c.name as name
          RETURN DISTINCT name, COUNT(name) as popularity
          ORDER BY popularity DESC
          LIMIT 10
          `,
        );
      }
    } else {
      if (query) {
        result = await this.neogma.queryRunner.run(
          `
          CALL db.index.fulltext.queryNodes("chains", $query) YIELD node as chain, score
          RETURN DISTINCT chain.name as name, score
          ORDER BY score DESC
          LIMIT 10
        `,
          { query },
        );
      } else {
        result = await this.neogma.queryRunner.run(
          `
          CYPHER runtime = parallel
          MATCH (c:Chain)
          MATCH (c)<-[:IS_DEPLOYED_ON|HAS_PROJECT*2]-(o:Organization)
          WITH c.name as name
          RETURN DISTINCT name, COUNT(name) as popularity
          ORDER BY popularity DESC
          LIMIT 10
          `,
        );
      }
    }

    return uniqBy(
      (result.records?.map(record => ({
        value: record.get("name"),
        link: `/${group}/chains/${slugify(record.get("name"))}`,
      })) as SearchResultItem[]) ?? [],
      "value",
    );
  }

  async search(params: SearchParams): Promise<SearchResult> {
    try {
      const { query: raw, excluded, nav } = params;
      const query = raw ? `*${raw}*` : null;

      if (nav) {
        let initial: SearchResultNav;
        switch (nav) {
          case "projects":
            initial = await this.searchProjects(query);
            break;
          case "organizations":
            initial = await this.searchOrganizations(query);
            break;
          case "grants":
            initial = await this.searchGrants(query, "active");
            break;
          case "impact":
            initial = await this.searchGrants(query, "inactive");
            break;
          case "vcs":
            initial = await this.searchVCs(query);
            break;
          default:
            initial = await this.searchProjects(query);
            break;
        }

        let result: SearchResultNav;

        if (excluded) {
          const keys = NAV_PILLAR_ORDERING[nav];
          const filtered = keys.map(x => ({
            [x]:
              initial[x]?.filter(y => !excluded.includes(slugify(y.value))) ??
              [],
          }));
          result = {
            names: filtered.find(x => !!x["names"])["names"] ?? [],
            ...filtered.reduce(
              (acc, curr) => ({ ...acc, ...curr }),
              {} as SearchResultNav,
            ),
          };
        } else {
          result = initial;
        }

        return {
          [nav]: result,
        };
      } else {
        const [projects, organizations, grants, impact, vcs] =
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
          impact,
          vcs,
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "search.service",
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
        impact: {
          names: [],
        },
        vcs: {
          names: [],
        },
      };
    }
  }

  async fetchHeaderText(
    nav: SearchNav,
    basePillar: string,
    item?: string,
  ): Promise<{
    title: string;
    description: string;
  }> {
    const pillar = basePillar ?? NAV_PILLAR_ORDERING[nav];
    if (pillar === "names") {
      const title = NAV_PILLAR_TITLES[nav];
      return {
        title: `${title} ${capitalize(pillar)}`,
        description: `A list of ${lowerCase(title)} ${pillar}${item ? ` called ${item}` : ""}`,
      };
    }

    // Handle new job pillars with programmatic SEO templates
    if (nav === "jobs" && typeof pillar === "string") {
      const jobsPillarText = this.getJobsPillarText(pillar, item);
      if (jobsPillarText) {
        return jobsPillarText;
      }
    }

    return (
      item
        ? await this.neogma.queryRunner.run(
            `
            CYPHER runtime = pipelined
            MATCH (pillar:PillarItem {nav: $nav, pillar: $pillar, item: $item})
            RETURN {
              title: pillar.title,
              description: pillar.description
            } as text
      `,
            { nav, pillar, item: slugify(item) },
          )
        : await this.neogma.queryRunner.run(
            `
            CYPHER runtime = pipelined
            MATCH (pillar:Pillar {nav: $nav, pillar: $pillar})
            RETURN {
              title: pillar.title,
              description: pillar.description
            } as text
      `,
            { nav, pillar, item },
          )
    ).records[0]?.get("text") as { title: string; description: string };
  }

  private getJobsPillarText(
    pillar: string,
    item?: string,
  ): { title: string; description: string } | null {
    if (!item) return null;

    const displayName = this.formatDisplayName(item);

    switch (pillar) {
      case "organizations":
        return {
          title: `${displayName} Jobs - Web3 & Crypto Careers`,
          description: `Explore crypto jobs at ${displayName}. Join the ${displayName} team and build the future of web3. Browse open positions and apply today.`,
        };

      case "seniority":
        return this.getSeniorityText(item, displayName);

      case "investors":
        return {
          title: `Jobs at ${displayName} Portfolio Companies`,
          description: `Find web3 jobs at companies backed by ${displayName}. Join crypto startups and blockchain projects in the ${displayName} portfolio.`,
        };

      case "fundingRounds":
        return {
          title: `${displayName} Crypto Jobs - Web3 Opportunities`,
          description: `Find web3 jobs at ${displayName} funded companies. Join crypto startups and blockchain projects at this funding stage.`,
        };

      case "classifications":
        return {
          title: `${displayName} Jobs - Web3 & Crypto Careers`,
          description: `Find ${displayName.toLowerCase()} jobs in web3 and crypto. Browse blockchain positions and apply today.`,
        };

      case "tags":
        return {
          title: `${displayName} Jobs - Web3 & Crypto Careers`,
          description: `Explore ${displayName} jobs in blockchain and crypto. Find positions requiring ${displayName} skills.`,
        };

      case "locations":
        return {
          title: `Web3 Jobs in ${displayName} - Crypto Careers`,
          description: `Find web3 and crypto jobs in ${displayName}. Browse blockchain positions in your area.`,
        };

      case "commitments":
        return {
          title: `${displayName} Web3 Jobs - Crypto Careers`,
          description: `Browse ${displayName.toLowerCase()} web3 positions. Find crypto jobs that match your schedule.`,
        };

      case "locationTypes":
        return {
          title: `${displayName} Web3 Jobs - Crypto Careers`,
          description: `Find ${displayName.toLowerCase()} web3 positions. Explore crypto jobs with flexible work arrangements.`,
        };

      default:
        // Generic fallback for any new pillar types
        return {
          title: `${displayName} Web3 Jobs - Crypto Careers`,
          description: `Explore web3 jobs related to ${displayName.toLowerCase()}. Find crypto and blockchain opportunities.`,
        };
    }
  }

  private formatDisplayName(slug: string): string {
    return slug
      .split("-")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  private getSeniorityText(
    item: string,
    displayName: string,
  ): { title: string; description: string } {
    const seniorityMap: Record<string, { title: string; description: string }> =
      {
        intern: {
          title: "Web3 Internships - Entry Level Crypto Jobs",
          description:
            "Discover web3 internship opportunities to kickstart your crypto career. Gain hands-on blockchain experience at top companies hiring interns.",
        },
        junior: {
          title: "Junior Web3 Jobs - Entry Level Crypto Careers",
          description:
            "Find junior web3 positions perfect for early career professionals. Explore entry-level crypto roles with growth potential in blockchain.",
        },
        senior: {
          title: "Senior Web3 Jobs - Experienced Crypto Roles",
          description:
            "Browse senior web3 positions for experienced professionals. Find crypto roles that leverage your blockchain expertise.",
        },
        lead: {
          title: "Lead Web3 Jobs - Crypto Leadership Positions",
          description:
            "Explore lead positions in web3. Find crypto roles where you can mentor teams, drive blockchain architecture, and shape product direction.",
        },
        head: {
          title: "Head of Web3 Jobs - Executive Crypto Careers",
          description:
            "Discover executive positions in web3. Lead departments, set strategic direction, and make high-impact decisions at crypto companies.",
        },
      };

    return (
      seniorityMap[item.toLowerCase()] ?? {
        title: `${displayName} Web3 Jobs - Crypto Careers`,
        description: `Find ${displayName.toLowerCase()}-level web3 positions. Explore crypto opportunities matching your experience level.`,
      }
    );
  }

  async getPillar(
    params: SearchPillarFiltersParams & { pillar: string },
    ecosystem: string | undefined,
  ): Promise<Pillar | undefined> {
    const query = NAV_FILTER_CONFIG_QUERY_MAPPINGS[params.nav];
    if (query && NAV_PILLAR_ORDERING[params.nav].includes(params.pillar)) {
      const result = await this.neogma.queryRunner.run(query, {
        ecosystem: ecosystem ?? null,
      });
      const configData =
        result.records?.map(record => record.get("config")) ?? [];

      const passedFilters = Object.keys(params).filter(
        x => x !== "nav" && params[x] !== null,
      );

      const validNavFilters = [
        ...Object.keys(FILTER_CONFIG_PRESETS[params.nav]),
        ...NAV_PILLAR_ORDERING[params.nav],
      ].flatMap(x => {
        const presets = FILTER_PARAM_KEY_PRESETS[params.nav][x];
        if (!presets) {
          return [];
        } else if (typeof presets === "string") {
          return [
            {
              paramKey: presets,
              kind: presets.includes("has") ? "SINGLE_SELECT" : "MULTI_SELECT",
              op: presets.includes("has") ? "eq" : "in",
            },
          ];
        } else {
          return [
            {
              paramKey: presets.lowest,
              kind: "RANGE",
              op: "gte",
            },
            {
              paramKey: presets.highest,
              kind: "RANGE",
              op: "lte",
            },
          ];
        }
      });

      const validPassedFilters =
        passedFilters?.filter(
          x =>
            validNavFilters.map(y => y.paramKey).includes(x) &&
            !x.includes("order"),
        ) ?? [];

      let data: string[];

      if (validPassedFilters.length > 0) {
        const map = new Map<
          string,
          {
            kind: "RANGE" | "SINGLE_SELECT" | "MULTI_SELECT";
            op: "gte" | "lte" | "eq" | "in";
          }
        >(
          validNavFilters.map(x => [
            x.paramKey,
            {
              kind: x.kind as "RANGE" | "SINGLE_SELECT" | "MULTI_SELECT",
              op: x.op as "gte" | "lte" | "eq" | "in",
            },
          ]),
        );
        const filtered = [];

        filtered.push(
          ...configData.filter(data => {
            return validPassedFilters
              .filter(x => x !== params.pillar)
              .reduce((acc, curr) => {
                let current: boolean;
                const value =
                  data[FILTER_PARAM_KEY_REVERSE_PRESETS[params.nav][curr]] ??
                  [];
                const mapped = map.get(curr);
                if (mapped.kind === "MULTI_SELECT") {
                  current = value
                    .filter(Boolean)
                    .some((y: string) => params[curr].includes(slugify(y)));
                } else if (mapped.kind === "SINGLE_SELECT") {
                  current = params[curr] === value;
                } else {
                  const op = mapped.op;
                  const filterValue = params[curr];
                  if (op === "gte") {
                    current = filterValue <= (intConverter(value) ?? 0);
                  } else {
                    current = filterValue >= (intConverter(value) ?? 0);
                  }
                }
                return acc && current;
              }, true);
          }),
        );

        data = filtered.flatMap(x => x[params.pillar]).filter(Boolean);
      } else {
        data = configData.flatMap(y => y[params.pillar]).filter(Boolean);
      }
      return {
        slug: params.pillar,
        label: NAV_FILTER_LABEL_MAPPINGS[params.nav][params.pillar],
        items: uniq(data.filter(isValidFilterConfig)),
      };
    } else {
      return undefined;
    }
  }

  async searchPillar(
    params: SearchPillarParams,
    ecosystem: string | undefined,
  ): Promise<ResponseWithOptionalData<PillarInfo>> {
    try {
      const pillar = params.pillar ?? NAV_PILLAR_ORDERING[params.nav][0];
      const pillarData = await this.getPillar(
        {
          ...params,
          pillar,
        },
        ecosystem,
      );
      const headerText = await this.fetchHeaderText(
        params.nav,
        pillar,
        params.item,
      );
      if (pillarData && headerText) {
        const items = pillarData.items;
        const wanted = items?.find(x => slugify(x) === params.item);
        const alts = await Promise.all(
          (NAV_PILLAR_ORDERING[params.nav] ?? [])
            .filter(x => x !== pillar)
            .map(x =>
              this.getPillar(
                {
                  ...params,
                  pillar: x,
                },
                ecosystem,
              ),
            ),
        );
        return {
          success: true,
          message: "Retrieved pillar info successfully",
          data: {
            ...headerText,
            activePillar: {
              slug: pillar,
              label: NAV_FILTER_LABEL_MAPPINGS[params.nav][params.pillar],
              items: [
                wanted,
                ...(items
                  ?.filter(x => slugify(x) !== params.item)
                  .slice(0, 20) ?? []),
              ].filter(Boolean),
            },
            altPillars: alts.map(x => ({
              ...x,
              items: x.items.slice(0, 20),
            })),
          },
        };
      } else {
        return {
          success: true,
          message: "Pillar not found",
          data: null,
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "search.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`SearchService::searchPillar ${err.message}`);
      return {
        success: false,
        message: "Error searching pillar",
      };
    }
  }

  async searchPillarItems(
    params: SearchPillarItemParams,
    ecosystem: string | undefined,
  ): Promise<PaginatedData<string>> {
    try {
      const data = await this.getPillar(params, ecosystem);
      if (data) {
        let results: string[];
        if (params.query) {
          results = go(params.query, data.items, {
            threshold: 0.3,
          }).map(x => x.target);
        } else {
          results = data.items;
        }

        if (results.length === 0) {
          return {
            page: -1,
            count: 0,
            total: 0,
            data: [],
          };
        } else {
          return paginate<string>(params.page, params.limit, results);
        }
      } else {
        return {
          page: -1,
          count: 0,
          total: 0,
          data: [],
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "search.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`SearchService::searchPillarItems ${err.message}`);
    }
  }

  async searchPillarSlugs(
    nav: SearchNav,
    ecosystem: string | undefined,
  ): Promise<string[]> {
    const queries = (NAV_PILLAR_ORDERING[nav] ?? [])
      .map(x => ({
        pillar: x,
        query: NAV_PILLAR_QUERY_MAPPINGS[nav][x],
      }))
      .filter(Boolean);
    if (queries.length > 0) {
      const results = await Promise.all(
        queries.map(async ({ pillar, query }) => ({
          pillar,
          items: (
            await this.neogma.queryRunner.run(query, { ecosystem })
          ).records.map(record => record.get("item") as string),
        })),
      );
      return results.flatMap(x =>
        x.items.map(
          y =>
            `${NAV_PILLAR_SLUG_PREFIX_MAPPINGS[nav][x.pillar]}-${slugify(y)}`,
        ),
      );
    } else {
      return [];
    }
  }

  async searchPillarDetailsBySlug(
    nav: SearchNav,
    slug: string,
  ): Promise<
    ResponseWithOptionalData<{
      title: string;
      description: string;
    }>
  > {
    const pillarPrefix = slug.match(/^([^-]+)/)?.[1];
    const pillar = NAV_PILLAR_ORDERING[nav].find(
      x => NAV_PILLAR_SLUG_PREFIX_MAPPINGS[nav][x] === pillarPrefix,
    );
    const item = slug.match(/^[^-]+-(.*)/)?.[1] ?? null;
    if (pillar) {
      const headerText = await this.fetchHeaderText(nav, pillar, item);
      if (headerText) {
        return {
          success: true,
          message: "Retrieved pillar details successfully",
          data: headerText,
        };
      } else {
        return {
          success: true,
          message: "Pillar not found",
        };
      }
    } else {
      return {
        success: true,
        message: "Pillar not found",
      };
    }
  }

  async fetchPillarItemLabels(
    params: FetchPillarItemLabelsInput,
  ): Promise<ResponseWithOptionalData<{ slug: string; label: string }[]>> {
    try {
      const queries = (
        params.pillars?.map(x => NAV_PILLAR_QUERY_MAPPINGS[params.nav][x]) ?? []
      ).filter(Boolean);
      if (queries.length > 0) {
        const results = await Promise.all(
          queries.map(query => this.neogma.queryRunner.run(query)),
        );
        const items = results.flatMap(x =>
          x.records?.map(record => record.get("item") as string),
        );

        if (items.length === 0) {
          return {
            success: true,
            message: "No result found",
            data: [],
          };
        } else {
          return {
            success: true,
            message: "Retrieved pillar item labels successfully",
            data: uniqBy(
              items
                .filter(x => params.slugs?.includes(slugify(x)))
                .map(x => ({
                  slug: slugify(x),
                  label: x,
                })) ?? [],
              "label",
            ),
          };
        }
      } else {
        return {
          success: true,
          message: "Pillar not found",
          data: [],
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "search.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`SearchService::fetchPillarItemLabels ${err.message}`);
      return {
        success: false,
        message: "Error fetching pillar item labels",
      };
    }
  }

  async searchPillarFilters(
    params: SearchPillarFiltersParams,
    ecosystem: string | undefined,
  ): Promise<
    ResponseWithOptionalData<(SearchRangeFilter | SingleSelectFilter)[]>
  > {
    try {
      const query = NAV_FILTER_CONFIG_QUERY_MAPPINGS[params.nav];

      if (query) {
        const result = await this.neogma.queryRunner.run(query, {
          ecosystem: ecosystem ?? null,
        });

        const passedFilters =
          Object.keys(params)?.filter(x => x !== "nav" && params[x] !== null) ??
          [];

        const navFilters = NAV_FILTER_CONFIGS[params.nav];

        const validNavFilters = [
          ...Object.keys(FILTER_CONFIG_PRESETS[params.nav]),
          ...NAV_PILLAR_ORDERING[params.nav],
        ].flatMap(x => {
          const presets = FILTER_PARAM_KEY_PRESETS[params.nav][x];
          if (!presets) {
            return [];
          } else if (typeof presets === "string") {
            return [
              {
                paramKey: presets,
                kind: presets.includes("has")
                  ? "SINGLE_SELECT"
                  : "MULTI_SELECT",
                op: presets.includes("has") ? "eq" : "in",
              },
            ];
          } else {
            return [
              {
                paramKey: presets.lowest,
                kind: "RANGE",
                op: "gte",
              },
              {
                paramKey: presets.highest,
                kind: "RANGE",
                op: "lte",
              },
            ];
          }
        });

        const validPassedFilters =
          passedFilters?.filter(
            x =>
              validNavFilters.map(y => y.paramKey).includes(x) &&
              !x.includes("order"),
          ) ?? [];

        const configData =
          result.records?.map(record => record.get("config")) ?? [];

        let data: (SearchRangeFilter | SingleSelectFilter)[];

        if (validPassedFilters.length > 0) {
          const map = new Map<
            string,
            {
              kind: "RANGE" | "SINGLE_SELECT" | "MULTI_SELECT";
              op: "gte" | "lte" | "eq" | "in";
            }
          >(
            validNavFilters.map(x => [
              x.paramKey,
              {
                kind: x.kind as "RANGE" | "SINGLE_SELECT" | "MULTI_SELECT",
                op: x.op as "gte" | "lte" | "eq" | "in",
              },
            ]),
          );
          const filtered = [];

          filtered.push(
            ...(configData ?? []).filter(data => {
              return validPassedFilters.reduce((acc, curr) => {
                let current: boolean;
                const value =
                  data[FILTER_PARAM_KEY_REVERSE_PRESETS[params.nav][curr]];
                const mapped = map.get(curr);
                if (mapped.kind === "MULTI_SELECT") {
                  current = (value ?? [])
                    .filter(Boolean)
                    .some((y: string) => params[curr].includes(slugify(y)));
                } else if (mapped.kind === "SINGLE_SELECT") {
                  current = params[curr] === value;
                } else {
                  const op = mapped.op;
                  const filterValue = params[curr];
                  if (op === "gte") {
                    current = filterValue <= (intConverter(value) ?? 0);
                  } else {
                    current = filterValue >= (intConverter(value) ?? 0);
                  }
                }
                return acc && current;
              }, true);
            }),
          );

          data = [
            ...navFilters.map(x => {
              const presets = FILTER_CONFIG_PRESETS[params.nav][x];
              if (!presets) {
                return null;
              }
              if (presets.kind === "RANGE") {
                return new SearchRangeFilter({
                  min: {
                    value:
                      intConverter(
                        min(filtered.flatMap(y => y[x]).filter(Boolean)),
                      ) ?? 0,
                    paramKey: FILTER_PARAM_KEY_PRESETS[params.nav][x].lowest,
                  },
                  max: {
                    value:
                      intConverter(
                        max(filtered.flatMap(y => y[x]).filter(Boolean)),
                      ) ?? 0,
                    paramKey: FILTER_PARAM_KEY_PRESETS[params.nav][x].highest,
                  },
                  ...presets,
                });
              } else {
                if (presets.kind === "SINGLE_SELECT") {
                  return new SingleSelectFilter({
                    options: defaultSort(
                      uniq(
                        filtered.flatMap(y => y[x]).filter(isValidFilterConfig),
                      ),
                    )
                      .asc()
                      .map(x => ({
                        label: x,
                        value: slugify(x),
                      })),
                    ...presets,
                    paramKey: FILTER_PARAM_KEY_PRESETS[params.nav][x],
                  });
                } else {
                  return new MultiSelectFilter({
                    options: defaultSort(
                      uniq(
                        filtered.flatMap(y => y[x]).filter(isValidFilterConfig),
                      ),
                    )
                      .asc()
                      .map(x => ({
                        label: x,
                        value: slugify(x),
                      }))
                      .slice(0, 20),
                    ...presets,
                    paramKey: FILTER_PARAM_KEY_PRESETS[params.nav][x],
                  });
                }
              }
            }),
          ].filter(Boolean);
        } else {
          data = [
            ...navFilters.map(x => {
              const presets = FILTER_CONFIG_PRESETS[params.nav][x];
              if (!presets) {
                return null;
              }
              if (presets.kind === "RANGE") {
                return new SearchRangeFilter({
                  min: {
                    value:
                      intConverter(
                        min(configData.flatMap(y => y[x]).filter(Boolean)),
                      ) ?? 0,
                    paramKey: FILTER_PARAM_KEY_PRESETS[params.nav][x].lowest,
                  },
                  max: {
                    value:
                      intConverter(
                        max(configData.flatMap(y => y[x]).filter(Boolean)),
                      ) ?? 0,
                    paramKey: FILTER_PARAM_KEY_PRESETS[params.nav][x].highest,
                  },
                  ...presets,
                });
              } else {
                if (presets.kind === "SINGLE_SELECT") {
                  return new SingleSelectFilter({
                    options: defaultSort(
                      uniq(
                        configData
                          .flatMap(y => y[x])
                          .filter(isValidFilterConfig),
                      ),
                    )
                      .asc()
                      .map(x => ({
                        label: x,
                        value: slugify(x),
                      })),
                    ...presets,
                    paramKey: FILTER_PARAM_KEY_PRESETS[params.nav][x],
                  });
                } else {
                  return new MultiSelectFilter({
                    options: defaultSort(
                      uniq(
                        configData
                          .flatMap(y => y[x])
                          .filter(isValidFilterConfig),
                      ),
                    )
                      .asc()
                      .map(x => ({
                        label: x,
                        value: slugify(x),
                      }))
                      .slice(0, 20),
                    ...presets,
                    paramKey: FILTER_PARAM_KEY_PRESETS[params.nav][x],
                  });
                }
              }
            }),
          ].filter(Boolean);
        }

        return {
          success: true,
          message: "Retrieved filter configs successfully",
          data,
        };
      } else {
        return {
          success: true,
          message: "Filter config not found",
          data: null,
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "search.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`SearchService::searchPillarFilters ${err.message}`);
    }
  }

  /**
   * Parse a pillar slug to extract the pillar type and value
   * @param slug - The full slug with prefix (e.g., "s-senior", "t-typescript")
   * @returns ParsedPillarSlug with pillarType, value, and prefix
   */
  private parsePillarSlug(slug: string): ParsedPillarSlug | null {
    const prefixMatch = slug.match(/^([^-]+)/);
    if (!prefixMatch) return null;

    const prefix = prefixMatch[1];
    const value = slug.match(/^[^-]+-(.*)/)?.[1] ?? null;

    if (!value) return null;

    // Find the pillar type for the jobs nav
    const jobsPillarMappings = NAV_PILLAR_SLUG_PREFIX_MAPPINGS["jobs"];
    const pillarType = Object.entries(jobsPillarMappings).find(
      ([, p]) => p === prefix,
    )?.[0];

    if (!pillarType) return null;

    return { pillarType, value, prefix };
  }

  /**
   * Resolve a location slug value to ALL original DB locations that match
   * Required because the same slug can map to multiple DB values due to:
   * - Accented vs non-accented characters (São Paulo vs Sao Paulo)
   * - Trailing/leading whitespace variations
   * @param slugValue - The slugified location value (e.g., "sao-paulo-brazil")
   * @returns Array of all matching DB location strings
   */
  private async resolveLocationSlugs(slugValue: string): Promise<string[]> {
    const query = `
      CYPHER runtime = pipelined
      MATCH (sj:StructuredJobpost)
      WHERE sj.location IS NOT NULL
      RETURN DISTINCT sj.location as location
    `;
    const result = await this.neogma.queryRunner.run(query);
    const locations = result.records.map(r => r.get("location") as string);

    // Find ALL locations whose slugified form matches
    return locations.filter(loc => slugify(loc) === slugValue);
  }

  /**
   * Build a Cypher WHERE clause based on the pillar type and value
   * @param pillarType - The type of pillar (e.g., "seniority", "tags", "organizations")
   * @param value - The normalized value to filter by
   * @returns Object containing the filter clause and any required parameters
   */
  private buildPillarFilterClause(
    pillarType: string,
    value: string,
  ): { clause: string; params: Record<string, unknown> } {
    const seniorityMap: Record<string, string> = {
      intern: "1",
      junior: "2",
      senior: "3",
      lead: "4",
      head: "5",
    };

    switch (pillarType) {
      case "tags":
        // Tags have normalizedName property
        return {
          clause: `EXISTS((sj)-[:HAS_TAG]->(:Tag {normalizedName: $filterValue}))`,
          params: { filterValue: value },
        };

      case "classifications":
        // JobpostClassification only has 'name', no normalizedName - remove separators and compare
        return {
          clause: `size([(sj)-[:HAS_CLASSIFICATION]->(cl:JobpostClassification) WHERE toLower(replace(replace(replace(cl.name, ' ', ''), '_', ''), '-', '')) = $filterValue | cl]) > 0`,
          params: { filterValue: value.toLowerCase().replace(/-/g, "") },
        };

      case "locations":
        // Check if value is a JSON array (resolved locations) or plain string (direct match)
        if (value.startsWith("[")) {
          // Resolved locations - use IN clause for exact matches
          return {
            clause: `sj.location IN $filterValues`,
            params: { filterValues: JSON.parse(value) as string[] },
          };
        }
        // Direct match - normalize both sides (works for non-accented locations)
        return {
          clause: `toLower(replace(replace(replace(replace(sj.location, ' ', ''), '/', ''), '-', ''), ',', '')) CONTAINS $filterValue`,
          params: { filterValue: value.toLowerCase().replace(/-/g, "") },
        };

      case "commitments":
        // JobpostCommitment only has 'name', no normalizedName - remove separators and compare
        return {
          clause: `size([(sj)-[:HAS_COMMITMENT]->(co:JobpostCommitment) WHERE toLower(replace(replace(replace(co.name, ' ', ''), '_', ''), '-', '')) = $filterValue | co]) > 0`,
          params: { filterValue: value.toLowerCase().replace(/-/g, "") },
        };

      case "locationTypes":
        // JobpostLocationType only has 'name', no normalizedName - remove separators and compare
        return {
          clause: `size([(sj)-[:HAS_LOCATION_TYPE]->(lt:JobpostLocationType) WHERE toLower(replace(replace(replace(lt.name, ' ', ''), '_', ''), '-', '')) = $filterValue | lt]) > 0`,
          params: { filterValue: value.toLowerCase().replace(/-/g, "") },
        };

      case "organizations":
        // Organization has normalizedName property - use anonymous node to avoid variable conflict
        return {
          clause: `EXISTS((sj)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(:Organization {normalizedName: $filterValue}))`,
          params: { filterValue: value },
        };

      case "seniority":
        const seniorityValue = seniorityMap[value.toLowerCase()] ?? value;
        return {
          clause: `sj.seniority = $filterValue`,
          params: { filterValue: seniorityValue },
        };

      case "investors":
        return {
          clause: `EXISTS((sj)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(:Organization)-[:HAS_FUNDING_ROUND]->(:FundingRound)-[:HAS_INVESTOR]->(:Investor {normalizedName: $filterValue}))`,
          params: { filterValue: value },
        };

      case "fundingRounds":
        // FundingRound uses 'roundName', no normalizedName - remove separators and compare
        return {
          clause: `size([(sj)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(:Organization)-[:HAS_FUNDING_ROUND]->(fr:FundingRound) WHERE toLower(replace(replace(replace(fr.roundName, ' ', ''), '_', ''), '-', '')) = $filterValue | fr]) > 0`,
          params: { filterValue: value.toLowerCase().replace(/-/g, "") },
        };

      default:
        return { clause: "true", params: {} };
    }
  }

  /**
   * Get pillar page data with filtered jobs using database-level filtering
   * Returns all jobs from the past 30 days matching the pillar filter
   * @param slug - Pillar slug with prefix (e.g., "s-senior", "t-typescript")
   * @param ecosystem - Optional ecosystem filter
   * @returns ResponseWithOptionalData containing title, description, and filtered jobs
   */
  async getPillarPageData(
    slug: string,
    ecosystem?: string,
  ): Promise<ResponseWithOptionalData<PillarPageData>> {
    try {
      // Parse the slug to get pillar type and value
      const parsed = this.parsePillarSlug(slug);
      if (!parsed) {
        return {
          success: false,
          message: `Invalid slug format: ${slug}`,
        };
      }

      const { pillarType, value } = parsed;

      // Get title and description
      const headerText = await this.fetchHeaderText("jobs", pillarType, value);
      if (!headerText) {
        return {
          success: true,
          message: "Pillar not found",
          data: null,
        };
      }

      // For locations, we try direct Cypher match first (fast path)
      // Only fallback to expensive JS-based resolution if no jobs found
      const filterValue = value;

      // Build the filter clause
      const { clause: filterClause, params: filterParams } =
        this.buildPillarFilterClause(pillarType, filterValue);

      // Fixed 30-day date range
      const now = Date.now();
      const thirtyDaysAgo = subDays(now, 30);
      const startDate = startOfDay(thirtyDaysAgo).getTime();
      const endDate = endOfDay(now).getTime();

      // Build and execute the optimized Cypher query (no pagination)
      const jobsQuery = `
        CYPHER runtime = parallel
        MATCH (sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (sj)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        ${ecosystem ? `AND EXISTS((sj)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(:Organization)-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem}))` : ""}
        AND ${filterClause}

        OPTIONAL MATCH (sj)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(org:Organization)

        WITH sj, org
        OPTIONAL MATCH (sj)-[:HAS_TAG]->(tag:Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
        WHERE NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
        AND NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation)

        WITH sj, org, tag
        OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
        OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
        WITH sj, org, tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others
        WITH sj, org, CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag

        WITH sj, org, collect(DISTINCT {id: canonicalTag.id, name: canonicalTag.name, normalizedName: canonicalTag.normalizedName}) as tags

        RETURN {
          id: sj.id,
          shortUUID: sj.shortUUID,
          title: sj.title,
          url: sj.url,
          summary: sj.summary,
          salary: sj.salary,
          minimumSalary: sj.minimumSalary,
          maximumSalary: sj.maximumSalary,
          salaryCurrency: sj.salaryCurrency,
          paysInCrypto: sj.paysInCrypto,
          offersTokenAllocation: sj.offersTokenAllocation,
          seniority: CASE sj.seniority
            WHEN '1' THEN 'Intern'
            WHEN '2' THEN 'Junior'
            WHEN '3' THEN 'Senior'
            WHEN '4' THEN 'Lead'
            WHEN '5' THEN 'Head'
            ELSE sj.seniority
          END,
          timestamp: COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp),
          commitment: [(sj)-[:HAS_COMMITMENT]->(c:JobpostCommitment) | c.name][0],
          locationType: [(sj)-[:HAS_LOCATION_TYPE]->(lt:JobpostLocationType) | lt.name][0],
          classification: [(sj)-[:HAS_CLASSIFICATION]->(cl:JobpostClassification) | cl.name][0],
          location: sj.location,
          access: COALESCE(sj.access, 'public'),
          featured: COALESCE(sj.featured, false),
          featureStartDate: sj.featureStartDate,
          featureEndDate: sj.featureEndDate,
          onboardIntoWeb3: COALESCE(sj.onboardIntoWeb3, false),
          organization: CASE WHEN org IS NOT NULL THEN {
            id: org.id,
            name: org.name,
            normalizedName: org.normalizedName,
            orgId: org.orgId,
            website: [(org)-[:HAS_WEBSITE]->(website) | website.url][0],
            summary: org.summary,
            location: org.location,
            description: org.description,
            logoUrl: org.logoUrl,
            headcountEstimate: org.headcountEstimate,
            fundingRounds: [(org)-[:HAS_FUNDING_ROUND]->(fr:FundingRound) WHERE fr.id IS NOT NULL | {
              id: fr.id,
              date: fr.date,
              roundName: fr.roundName,
              raisedAmount: fr.raisedAmount
            }],
            investors: [(org)-[:HAS_FUNDING_ROUND]->(:FundingRound)-[:HAS_INVESTOR]->(inv:Investor) | {
              id: inv.id,
              name: inv.name,
              normalizedName: inv.normalizedName
            }]
          } ELSE null END,
          tags: [t IN tags WHERE t.name IS NOT NULL | t]
        } as job
        ORDER BY job.featured DESC, job.timestamp DESC
        LIMIT 20
      `;

      const queryParams = {
        ...filterParams,
        startDate,
        endDate,
        ecosystem: ecosystem ?? null,
      };

      const jobsResult = await this.neogma.queryRunner.run(
        jobsQuery,
        queryParams,
      );

      const jobs: PillarJob[] =
        jobsResult.records
          ?.map(record => {
            const job = record.get("job");
            const org = job.organization;
            return {
              ...job,
              salary: intConverter(job.salary) || null,
              minimumSalary: intConverter(job.minimumSalary) || null,
              maximumSalary: intConverter(job.maximumSalary) || null,
              timestamp: intConverter(job.timestamp),
              featureStartDate: intConverter(job.featureStartDate) || null,
              featureEndDate: intConverter(job.featureEndDate) || null,
              tags: (job.tags ?? []).filter(
                (t: { name: string | null }) => t.name !== null,
              ),
              organization: org
                ? {
                    ...org,
                    headcountEstimate:
                      intConverter(org.headcountEstimate) || null,
                    fundingRounds: (org.fundingRounds ?? []).map(
                      (fr: Record<string, unknown>) => ({
                        ...fr,
                        date: intConverter(fr.date as number),
                        raisedAmount:
                          intConverter(fr.raisedAmount as number) || null,
                      }),
                    ),
                    investors: org.investors ?? [],
                  }
                : null,
            };
          })
          .filter(Boolean) ?? [];

      // If no jobs found for locations, try fallback with resolved locations
      // This handles accented characters (São Paulo) that Cypher can't transliterate
      if (jobs.length === 0 && pillarType === "locations") {
        const resolvedLocations = await this.resolveLocationSlugs(value);
        if (resolvedLocations.length > 0) {
          // Retry with resolved locations (exact match via IN clause)
          const { clause: fallbackClause, params: fallbackParams } =
            this.buildPillarFilterClause(
              pillarType,
              JSON.stringify(resolvedLocations),
            );

          const fallbackQuery = jobsQuery.replace(filterClause, fallbackClause);
          const fallbackResult = await this.neogma.queryRunner.run(
            fallbackQuery,
            {
              ...fallbackParams,
              startDate,
              endDate,
              ecosystem: ecosystem ?? null,
            },
          );

          const fallbackJobs: PillarJob[] =
            fallbackResult.records
              ?.map(record => {
                const job = record.get("job");
                const org = job.organization;
                return {
                  ...job,
                  salary: intConverter(job.salary) || null,
                  minimumSalary: intConverter(job.minimumSalary) || null,
                  maximumSalary: intConverter(job.maximumSalary) || null,
                  timestamp: intConverter(job.timestamp),
                  featureStartDate: intConverter(job.featureStartDate) || null,
                  featureEndDate: intConverter(job.featureEndDate) || null,
                  tags: (job.tags ?? []).filter(
                    (t: { name: string | null }) => t.name !== null,
                  ),
                  organization: org
                    ? {
                        ...org,
                        headcountEstimate:
                          intConverter(org.headcountEstimate) || null,
                        fundingRounds: (org.fundingRounds ?? []).map(
                          (fr: Record<string, unknown>) => ({
                            ...fr,
                            date: intConverter(fr.date as number),
                            raisedAmount:
                              intConverter(fr.raisedAmount as number) || null,
                          }),
                        ),
                        investors: org.investors ?? [],
                      }
                    : null,
                };
              })
              .filter(Boolean) ?? [];

          if (fallbackJobs.length > 0) {
            return {
              success: true,
              message: "Retrieved pillar page data",
              data: {
                title: headerText.title,
                description: headerText.description,
                jobs: fallbackJobs,
                suggestedPillars: this.deriveSuggestedPillars(
                  fallbackJobs,
                  pillarType,
                  value,
                ),
              },
            };
          }
        }
      }

      // No jobs found after all attempts
      if (jobs.length === 0) {
        return {
          success: true,
          message: "No jobs found for this pillar",
          data: null,
        };
      }

      return {
        success: true,
        message: "Retrieved pillar page data",
        data: {
          title: headerText.title,
          description: headerText.description,
          jobs,
          suggestedPillars: this.deriveSuggestedPillars(
            jobs,
            pillarType,
            value,
          ),
        },
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "search.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`SearchService::getPillarPageData ${err.message}`);
      return {
        success: false,
        message: "Error retrieving pillar page data",
      };
    }
  }

  private deriveSuggestedPillars(
    jobs: PillarJob[],
    currentPillarType: string,
    currentValue: string,
  ): SuggestedPillar[] {
    const TOTAL_BUDGET = 14;
    const SAME_TYPE_LIMIT = 4;
    const MIN_PER_CROSS_TYPE = 2;
    const MAX_PER_CROSS_TYPE = 4;

    const totalJobs = jobs.length;
    const useUbiquityPenalty = totalJobs > 3;

    const configs: {
      pillarType: string;
      prefix: string;
      extract: (job: PillarJob) => { label: string; key: string }[];
    }[] = [
      {
        pillarType: "tags",
        prefix: "/t-",
        extract: job =>
          job.tags.map(t => ({ label: t.name, key: t.normalizedName })),
      },
      {
        pillarType: "organizations",
        prefix: "/o-",
        extract: job =>
          job.organization
            ? [
                {
                  label: job.organization.name,
                  key: job.organization.normalizedName,
                },
              ]
            : [],
      },
      {
        pillarType: "classifications",
        prefix: "/cl-",
        extract: job =>
          job.classification
            ? [{ label: job.classification, key: slugify(job.classification) }]
            : [],
      },
      {
        pillarType: "locations",
        prefix: "/l-",
        extract: job =>
          job.location
            ? [{ label: job.location, key: slugify(job.location) }]
            : [],
      },
      {
        pillarType: "investors",
        prefix: "/i-",
        extract: job =>
          (job.organization?.investors ?? []).map(i => ({
            label: i.name,
            key: i.normalizedName,
          })),
      },
      {
        pillarType: "fundingRounds",
        prefix: "/fr-",
        extract: job =>
          (job.organization?.fundingRounds ?? [])
            .filter(fr => fr.roundName)
            .map(fr => ({
              label: fr.roundName as string,
              key: slugify(fr.roundName as string),
            })),
      },
    ];

    type Candidate = {
      key: string;
      label: string;
      prefix: string;
      score: number;
    };

    const toSuggestion = (c: Candidate): SuggestedPillar => ({
      label: c.label,
      href: `${c.prefix}${c.key}`,
    });

    // Build scored candidates per type
    const candidatesByType = new Map<string, Candidate[]>();

    for (const config of configs) {
      const counts = new Map<string, { label: string; count: number }>();

      for (const job of jobs) {
        for (const item of config.extract(job)) {
          if (!item.key) continue;
          if (
            config.pillarType === currentPillarType &&
            item.key === currentValue
          )
            continue;
          const existing = counts.get(item.key);
          if (existing) {
            existing.count++;
          } else {
            counts.set(item.key, { label: item.label, count: 1 });
          }
        }
      }

      const scored: Candidate[] = Array.from(counts.entries())
        .map(([key, { label, count }]) => ({
          key,
          label,
          prefix: config.prefix,
          score: useUbiquityPenalty ? count * (1 - count / totalJobs) : count,
        }))
        .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

      candidatesByType.set(config.pillarType, scored);
    }

    // Same-type pick: up to SAME_TYPE_LIMIT
    const sameTypePicked = (
      candidatesByType.get(currentPillarType) ?? []
    ).slice(0, SAME_TYPE_LIMIT);
    const results: SuggestedPillar[] = sameTypePicked.map(toSuggestion);

    // Cross-type fill with remaining budget
    let remaining = TOTAL_BUDGET - sameTypePicked.length;

    const crossTypeGroups = configs
      .filter(c => c.pillarType !== currentPillarType)
      .map(c => ({
        candidates: candidatesByType.get(c.pillarType) ?? [],
        taken: 0,
      }))
      .filter(g => g.candidates.length > 0);

    // First pass: give each cross-type group up to MIN_PER_CROSS_TYPE
    for (const group of crossTypeGroups) {
      const take = Math.min(
        MIN_PER_CROSS_TYPE,
        group.candidates.length,
        remaining,
      );
      group.taken = take;
      remaining -= take;
      if (remaining <= 0) break;
    }

    // Second pass: round-robin remaining slots
    let changed = true;
    while (remaining > 0 && changed) {
      changed = false;
      for (const group of crossTypeGroups) {
        if (remaining <= 0) break;
        if (
          group.taken < group.candidates.length &&
          group.taken < MAX_PER_CROSS_TYPE
        ) {
          group.taken++;
          remaining--;
          changed = true;
        }
      }
    }

    // Emit cross-type results in config order
    for (const group of crossTypeGroups) {
      results.push(...group.candidates.slice(0, group.taken).map(toSuggestion));
    }

    return results;
  }

  /**
   * Sanitize a query string for fulltext index search.
   * Escapes special Lucene characters that could cause query parse errors.
   */
  private sanitizeFulltextQuery(query: string): string {
    // Escape Lucene special characters: + - && || ! ( ) { } [ ] ^ " ~ * ? : \ /
    return query.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&");
  }

  private readonly GROUP_LABELS: Record<SuggestionGroupId, string> = {
    jobs: "Jobs",
    organizations: "Organizations",
    tags: "Tags",
    classifications: "Classifications",
    locations: "Locations",
    investors: "Investors",
    fundingRounds: "Funding Rounds",
  };

  /**
   * Get the 30-day date range for pillar page consistency.
   * Suggestions should only return items that have jobs within this range.
   */
  private getPillarDateRange(): { startDate: number; endDate: number } {
    const now = Date.now();
    const thirtyDaysAgo = subDays(now, 30);
    return {
      startDate: startOfDay(thirtyDaysAgo).getTime(),
      endDate: endOfDay(now).getTime(),
    };
  }

  /**
   * Check if a group has any results for a given query (LIMIT 1 presence check).
   * Pillar-linked categories (organizations, tags, classifications, locations,
   * investors, fundingRounds) use 30-day date filter for consistency with pillar pages.
   */
  private async checkGroupHasResults(
    group: SuggestionGroupId,
    query: string | null,
    fulltextQuery: string | null,
  ): Promise<boolean> {
    // Without a query, all groups have results
    if (!query) return true;

    const { startDate, endDate } = this.getPillarDateRange();

    const queries: Record<SuggestionGroupId, string> = {
      jobs: `
        CYPHER runtime = pipelined
        MATCH (sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (sj)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        AND ALL(word IN split(toLower(replace(replace($query, ' ', ''), '-', '')), ' ')
          WHERE toLower(replace(replace(sj.title, ' ', ''), '-', '')) CONTAINS word)
        RETURN true as hasResults
        LIMIT 1
      `,
      organizations: `
        CALL db.index.fulltext.queryNodes("organizations", $fulltextQuery) YIELD node as org, score
        MATCH (org)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        RETURN true as hasResults
        LIMIT 1
      `,
      tags: `
        CALL db.index.fulltext.queryNodes("tagNames", $fulltextQuery) YIELD node as tag, score
        MATCH (sj:StructuredJobpost)-[:HAS_TAG]->(tag)
        WHERE COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        AND NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation)
        AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
        RETURN true as hasResults
        LIMIT 1
      `,
      classifications: `
        CYPHER runtime = pipelined
        MATCH (cl:JobpostClassification)<-[:HAS_CLASSIFICATION]-(sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (sj)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        AND toLower(cl.name) CONTAINS toLower($query)
        RETURN true as hasResults
        LIMIT 1
      `,
      locations: `
        CYPHER runtime = pipelined
        MATCH (sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (sj)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        AND sj.location IS NOT NULL
        AND ALL(word IN split(toLower($query), ' ') WHERE toLower(sj.location) CONTAINS word)
        RETURN true as hasResults
        LIMIT 1
      `,
      investors: `
        CALL db.index.fulltext.queryNodes("investors", $fulltextQuery) YIELD node as investor, score
        MATCH (org:Organization)-[:HAS_FUNDING_ROUND]->(:FundingRound)-[:HAS_INVESTOR]->(investor)
        MATCH (org)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        RETURN true as hasResults
        LIMIT 1
      `,
      fundingRounds: `
        CALL db.index.fulltext.queryNodes("rounds", $fulltextQuery) YIELD node as fr, score
        MATCH (org:Organization)-[:HAS_FUNDING_ROUND]->(fr)
        MATCH (org)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        RETURN true as hasResults
        LIMIT 1
      `,
    };

    const result = await this.neogma.queryRunner.run(queries[group], {
      query,
      fulltextQuery,
      startDate,
      endDate,
    });
    return result.records.length > 0;
  }

  /**
   * Get groups that have results for a given query
   */
  private async getGroupsWithResults(
    query: string | null,
  ): Promise<GroupInfo[]> {
    // Without a query, return all groups
    if (!query) {
      return SUGGESTION_GROUPS.map(id => ({
        id,
        label: this.GROUP_LABELS[id],
      }));
    }

    const fulltextQuery = `*${this.sanitizeFulltextQuery(query)}*`;

    // Run all presence checks in parallel
    const results = await Promise.all(
      SUGGESTION_GROUPS.map(async group => ({
        id: group,
        hasResults: await this.checkGroupHasResults(
          group,
          query,
          fulltextQuery,
        ),
      })),
    );

    return results
      .filter(r => r.hasResults)
      .map(r => ({
        id: r.id,
        label: this.GROUP_LABELS[r.id],
      }));
  }

  /**
   * Get paginated items for a specific group
   */
  private async getGroupItems(
    group: SuggestionGroupId,
    query: string | null,
    page: number,
    limit: number,
  ): Promise<{ items: SuggestionItem[]; hasMore: boolean }> {
    // Ensure integers for Neo4j SKIP/LIMIT
    const skip = Math.floor((page - 1) * limit);
    // Fetch one extra to determine hasMore
    const fetchLimit = Math.floor(limit + 1);

    let items: SuggestionItem[];

    switch (group) {
      case "jobs":
        items = await this.getJobsGroupItems(query, skip, fetchLimit);
        break;
      case "organizations":
        items = await this.getOrganizationsGroupItems(query, skip, fetchLimit);
        break;
      case "tags":
        items = await this.getTagsGroupItems(query, skip, fetchLimit);
        break;
      case "classifications":
        items = await this.getClassificationsGroupItems(
          query,
          skip,
          fetchLimit,
        );
        break;
      case "locations":
        items = await this.getLocationsGroupItems(query, skip, fetchLimit);
        break;
      case "investors":
        items = await this.getInvestorsGroupItems(query, skip, fetchLimit);
        break;
      case "fundingRounds":
        items = await this.getFundingRoundsGroupItems(query, skip, fetchLimit);
        break;
      default:
        items = [];
    }

    // Dedupe by id (first occurrence wins)
    const uniqueItems = [
      ...new Map(items.map(item => [item.id, item])).values(),
    ];

    const hasMore = uniqueItems.length > limit;
    return {
      items: uniqueItems.slice(0, limit),
      hasMore,
    };
  }

  /**
   * Get paginated jobs with optional search query.
   * Jobs are searched by title only (since only title is displayed, query highlighting requires title match).
   */
  private async getJobsGroupItems(
    query: string | null,
    skip: number,
    limit: number,
  ): Promise<SuggestionItem[]> {
    // Ensure integers for Neo4j
    const intSkip = Math.floor(skip);
    const intLimit = Math.floor(limit);

    const { startDate, endDate } = this.getPillarDateRange();

    if (!query) {
      // No query: return most recent jobs with org name, limited to 30 days
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = pipelined
        MATCH (org:Organization)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (sj)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        RETURN DISTINCT sj.shortUUID as id, sj.title as title, org.name as orgName, sj.timestamp as timestamp
        ORDER BY timestamp DESC
        SKIP $skip
        LIMIT $limit
        `,
        { skip: int(intSkip), limit: int(intLimit), startDate, endDate },
      );

      return result.records.map(record => ({
        id: record.get("id") as string,
        label: `${record.get("title")} at ${record.get("orgName")}`,
        href: `/${slugify(record.get("title") as string)}/${record.get("id") as string}`,
      }));
    }

    // With query: search by title, include org name, limited to 30 days
    const result = await this.neogma.queryRunner.run(
      `
      CYPHER runtime = pipelined
      MATCH (org:Organization)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
      WHERE NOT (sj)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
      AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
      AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
      AND ALL(word IN split(toLower(replace(replace($query, ' ', ''), '-', '')), ' ')
        WHERE toLower(replace(replace(sj.title, ' ', ''), '-', '')) CONTAINS word)
      RETURN DISTINCT sj.shortUUID as id, sj.title as title, org.name as orgName
      SKIP $skip
      LIMIT $limit
      `,
      { query, skip: int(intSkip), limit: int(intLimit), startDate, endDate },
    );

    return result.records.map(record => ({
      id: record.get("id") as string,
      label: `${record.get("title")} at ${record.get("orgName")}`,
      href: `/${slugify(record.get("title") as string)}/${record.get("id") as string}`,
    }));
  }

  private async getOrganizationsGroupItems(
    query: string | null,
    skip: number,
    limit: number,
  ): Promise<SuggestionItem[]> {
    const intSkip = Math.floor(skip);
    const intLimit = Math.floor(limit);
    const { startDate, endDate } = this.getPillarDateRange();

    if (!query) {
      // No query: return alphabetically sorted organizations with jobs in last 30 days
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = pipelined
        MATCH (org:Organization)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        RETURN DISTINCT org.normalizedName as id, org.name as label
        ORDER BY label
        SKIP $skip
        LIMIT $limit
        `,
        { skip: int(intSkip), limit: int(intLimit), startDate, endDate },
      );

      return result.records.map(record => ({
        id: record.get("id") as string,
        label: record.get("label") as string,
        href: `/o-${record.get("id") as string}`,
      }));
    }

    const fulltextQuery = `*${this.sanitizeFulltextQuery(query)}*`;
    const result = await this.neogma.queryRunner.run(
      `
      CALL db.index.fulltext.queryNodes("organizations", $query) YIELD node as org, score
      MATCH (org)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
      WHERE COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
      AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
      RETURN DISTINCT org.normalizedName as id, org.name as label, score
      ORDER BY score DESC
      SKIP $skip
      LIMIT $limit
      `,
      {
        query: fulltextQuery,
        skip: int(intSkip),
        limit: int(intLimit),
        startDate,
        endDate,
      },
    );

    return result.records.map(record => ({
      id: record.get("id") as string,
      label: record.get("label") as string,
      href: `/o-${record.get("id") as string}`,
    }));
  }

  private async getTagsGroupItems(
    query: string | null,
    skip: number,
    limit: number,
  ): Promise<SuggestionItem[]> {
    const intSkip = Math.floor(skip);
    const intLimit = Math.floor(limit);
    const { startDate, endDate } = this.getPillarDateRange();

    if (!query) {
      // No query: return alphabetically sorted tags with jobs in last 30 days
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = pipelined
        MATCH (tag:Tag)<-[:HAS_TAG]-(sj:StructuredJobpost)
        WHERE COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        AND NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation)
        AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
        RETURN DISTINCT tag.normalizedName as id, tag.name as label
        ORDER BY label
        SKIP $skip
        LIMIT $limit
        `,
        { skip: int(intSkip), limit: int(intLimit), startDate, endDate },
      );

      return result.records.map(record => ({
        id: record.get("id") as string,
        label: record.get("label") as string,
        href: `/t-${record.get("id") as string}`,
      }));
    }

    const fulltextQuery = `*${this.sanitizeFulltextQuery(query)}*`;
    const result = await this.neogma.queryRunner.run(
      `
      CALL db.index.fulltext.queryNodes("tagNames", $query) YIELD node as tag, score
      MATCH (sj:StructuredJobpost)-[:HAS_TAG]->(tag)
      WHERE COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
      AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
      AND NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation)
      AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
      RETURN DISTINCT tag.normalizedName as id, tag.name as label, score
      ORDER BY score DESC
      SKIP $skip
      LIMIT $limit
      `,
      {
        query: fulltextQuery,
        skip: int(intSkip),
        limit: int(intLimit),
        startDate,
        endDate,
      },
    );

    return result.records.map(record => ({
      id: record.get("id") as string,
      label: record.get("label") as string,
      href: `/t-${record.get("id") as string}`,
    }));
  }

  private async getClassificationsGroupItems(
    query: string | null,
    skip: number,
    limit: number,
  ): Promise<SuggestionItem[]> {
    const intSkip = Math.floor(skip);
    const intLimit = Math.floor(limit);
    const { startDate, endDate } = this.getPillarDateRange();

    if (!query) {
      // No query: return alphabetically sorted classifications with jobs in last 30 days
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = pipelined
        MATCH (cl:JobpostClassification)<-[:HAS_CLASSIFICATION]-(sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (sj)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        RETURN DISTINCT cl.name as label
        ORDER BY label
        SKIP $skip
        LIMIT $limit
        `,
        { skip: int(intSkip), limit: int(intLimit), startDate, endDate },
      );

      return result.records.map(record => {
        const label = record.get("label") as string;
        return {
          id: slugify(label),
          label,
          href: `/cl-${slugify(label)}`,
        };
      });
    }

    const result = await this.neogma.queryRunner.run(
      `
      CYPHER runtime = pipelined
      MATCH (cl:JobpostClassification)<-[:HAS_CLASSIFICATION]-(sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
      WHERE NOT (sj)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
      AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
      AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
      AND toLower(cl.name) CONTAINS toLower($query)
      RETURN DISTINCT cl.name as label
      ORDER BY label
      SKIP $skip
      LIMIT $limit
      `,
      { query, skip: int(intSkip), limit: int(intLimit), startDate, endDate },
    );

    return result.records.map(record => {
      const label = record.get("label") as string;
      return {
        id: slugify(label),
        label,
        href: `/cl-${slugify(label)}`,
      };
    });
  }

  private async getLocationsGroupItems(
    query: string | null,
    skip: number,
    limit: number,
  ): Promise<SuggestionItem[]> {
    const intSkip = Math.floor(skip);
    const intLimit = Math.floor(limit);
    const { startDate, endDate } = this.getPillarDateRange();

    if (!query) {
      // No query: return alphabetically sorted locations with jobs in last 30 days
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = pipelined
        MATCH (sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE NOT (sj)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        AND sj.location IS NOT NULL
        RETURN DISTINCT sj.location as label
        ORDER BY label
        SKIP $skip
        LIMIT $limit
        `,
        { skip: int(intSkip), limit: int(intLimit), startDate, endDate },
      );

      return result.records.map(record => {
        const label = record.get("label") as string;
        return {
          id: slugify(label),
          label,
          href: `/l-${slugify(label)}`,
        };
      });
    }

    const result = await this.neogma.queryRunner.run(
      `
      CYPHER runtime = pipelined
      MATCH (sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
      WHERE NOT (sj)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
      AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
      AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
      AND sj.location IS NOT NULL
      AND ALL(word IN split(toLower($query), ' ') WHERE toLower(sj.location) CONTAINS word)
      RETURN DISTINCT sj.location as label
      ORDER BY label
      SKIP $skip
      LIMIT $limit
      `,
      { query, skip: int(intSkip), limit: int(intLimit), startDate, endDate },
    );

    return result.records.map(record => {
      const label = record.get("label") as string;
      return {
        id: slugify(label),
        label,
        href: `/l-${slugify(label)}`,
      };
    });
  }

  private async getInvestorsGroupItems(
    query: string | null,
    skip: number,
    limit: number,
  ): Promise<SuggestionItem[]> {
    const intSkip = Math.floor(skip);
    const intLimit = Math.floor(limit);
    const { startDate, endDate } = this.getPillarDateRange();

    if (!query) {
      // No query: return alphabetically sorted investors with jobs in last 30 days
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = pipelined
        MATCH (org:Organization)-[:HAS_FUNDING_ROUND]->(:FundingRound)-[:HAS_INVESTOR]->(investor:Investor)
        MATCH (org)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        RETURN DISTINCT investor.normalizedName as id, investor.name as label
        ORDER BY label
        SKIP $skip
        LIMIT $limit
        `,
        { skip: int(intSkip), limit: int(intLimit), startDate, endDate },
      );

      return result.records.map(record => ({
        id: record.get("id") as string,
        label: record.get("label") as string,
        href: `/i-${record.get("id") as string}`,
      }));
    }

    const fulltextQuery = `*${this.sanitizeFulltextQuery(query)}*`;
    const result = await this.neogma.queryRunner.run(
      `
      CALL db.index.fulltext.queryNodes("investors", $query) YIELD node as investor, score
      MATCH (org:Organization)-[:HAS_FUNDING_ROUND]->(:FundingRound)-[:HAS_INVESTOR]->(investor)
      MATCH (org)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
      WHERE COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
      AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
      RETURN DISTINCT investor.normalizedName as id, investor.name as label, score
      ORDER BY score DESC
      SKIP $skip
      LIMIT $limit
      `,
      {
        query: fulltextQuery,
        skip: int(intSkip),
        limit: int(intLimit),
        startDate,
        endDate,
      },
    );

    return result.records.map(record => ({
      id: record.get("id") as string,
      label: record.get("label") as string,
      href: `/i-${record.get("id") as string}`,
    }));
  }

  private async getFundingRoundsGroupItems(
    query: string | null,
    skip: number,
    limit: number,
  ): Promise<SuggestionItem[]> {
    const intSkip = Math.floor(skip);
    const intLimit = Math.floor(limit);
    const { startDate, endDate } = this.getPillarDateRange();

    if (!query) {
      // No query: return alphabetically sorted funding rounds with jobs in last 30 days
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = pipelined
        MATCH (org:Organization)-[:HAS_FUNDING_ROUND]->(fr:FundingRound)
        MATCH (org)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
        WHERE COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        RETURN DISTINCT fr.roundName as label
        ORDER BY label
        SKIP $skip
        LIMIT $limit
        `,
        { skip: int(intSkip), limit: int(intLimit), startDate, endDate },
      );

      return result.records.map(record => {
        const label = record.get("label") as string;
        return {
          id: slugify(label),
          label,
          href: `/fr-${slugify(label)}`,
        };
      });
    }

    const fulltextQuery = `*${this.sanitizeFulltextQuery(query)}*`;
    const result = await this.neogma.queryRunner.run(
      `
      CALL db.index.fulltext.queryNodes("rounds", $query) YIELD node as fr, score
      MATCH (org:Organization)-[:HAS_FUNDING_ROUND]->(fr)
      MATCH (org)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(:Jobpost)-[:HAS_STRUCTURED_JOBPOST]->(sj:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
      WHERE COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
      AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
      RETURN DISTINCT fr.roundName as label, score
      ORDER BY score DESC
      SKIP $skip
      LIMIT $limit
      `,
      {
        query: fulltextQuery,
        skip: int(intSkip),
        limit: int(intLimit),
        startDate,
        endDate,
      },
    );

    return result.records.map(record => {
      const label = record.get("label") as string;
      return {
        id: slugify(label),
        label,
        href: `/fr-${slugify(label)}`,
      };
    });
  }

  /**
   * Get job search suggestions with pagination and group selection.
   */
  async getSkillSuggestions(
    params: SkillSuggestionsInput,
  ): Promise<ResponseWithOptionalData<SkillSuggestionsData>> {
    try {
      const { q, page = 1, limit = 10 } = params;
      const query = q?.trim() || null;
      const skip = Math.floor((page - 1) * limit);
      const fetchLimit = Math.floor(limit + 1);

      const items = await this.getSkillSuggestionItems(query, skip, fetchLimit);

      const uniqueItems = [
        ...new Map(items.map(item => [item.id, item])).values(),
      ];

      const hasMore = uniqueItems.length > limit;
      return {
        success: true,
        message: "Retrieved skill suggestions successfully",
        data: {
          items: uniqueItems.slice(0, limit),
          page,
          hasMore,
        },
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "search.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`SearchService::getSkillSuggestions ${err.message}`);
      return {
        success: false,
        message: "Failed to retrieve skill suggestions",
      };
    }
  }

  private async getSkillSuggestionItems(
    query: string | null,
    skip: number,
    limit: number,
  ): Promise<SkillSuggestionItem[]> {
    const intSkip = Math.floor(skip);
    const intLimit = Math.floor(limit);
    const { startDate, endDate } = this.getPillarDateRange();

    if (!query) {
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = pipelined
        MATCH (tag:Tag)<-[:HAS_TAG]-(sj:StructuredJobpost)
        WHERE COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
        AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
        AND NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation)
        AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
        WITH tag.id as id, tag.name as name, tag.normalizedName as normalizedName, count(DISTINCT sj) as popularity
        RETURN id, name, normalizedName
        ORDER BY popularity DESC, name ASC
        SKIP $skip LIMIT $limit
        `,
        { skip: int(intSkip), limit: int(intLimit), startDate, endDate },
      );

      return result.records.map(record => ({
        id: record.get("id") as string,
        name: record.get("name") as string,
        normalizedName: record.get("normalizedName") as string,
      }));
    }

    const fulltextQuery = `*${this.sanitizeFulltextQuery(query)}*`;
    const result = await this.neogma.queryRunner.run(
      `
      CALL db.index.fulltext.queryNodes("tagNames", $query) YIELD node as tag, score
      MATCH (sj:StructuredJobpost)-[:HAS_TAG]->(tag)
      WHERE COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) >= $startDate
      AND COALESCE(sj.publishedTimestamp, sj.firstSeenTimestamp) <= $endDate
      AND NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation)
      AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
      RETURN DISTINCT tag.id as id, tag.name as name, tag.normalizedName as normalizedName, score
      ORDER BY score DESC
      SKIP $skip
      LIMIT $limit
      `,
      {
        query: fulltextQuery,
        skip: int(intSkip),
        limit: int(intLimit),
        startDate,
        endDate,
      },
    );

    return result.records.map(record => ({
      id: record.get("id") as string,
      name: record.get("name") as string,
      normalizedName: record.get("normalizedName") as string,
    }));
  }

  async getJobSuggestions(
    params: JobSuggestionsInput,
  ): Promise<SuggestionsResponse> {
    try {
      const { q, group: requestedGroup, page = 1, limit = 10 } = params;
      const query = q?.trim() || null;

      // Get groups with results first to determine the active group
      const groups = await this.getGroupsWithResults(query);
      const groupIds = groups.map(g => g.id) as SuggestionGroupId[];

      // Determine active group:
      // 1. Use requested group if specified and has results
      // 2. Otherwise prefer "jobs" if it has results
      // 3. Otherwise use first group with results
      let activeGroup: SuggestionGroupId;
      if (requestedGroup && groupIds.includes(requestedGroup)) {
        activeGroup = requestedGroup;
      } else if (groupIds.includes("jobs")) {
        activeGroup = "jobs";
      } else {
        activeGroup = groupIds[0] ?? "jobs";
      }

      // Get items for the active group
      const { items, hasMore } = await this.getGroupItems(
        activeGroup,
        query,
        page,
        limit,
      );

      return {
        groups,
        activeGroup,
        items,
        page,
        hasMore,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "search.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`SearchService::getJobSuggestions ${err.message}`);
      return {
        groups: [],
        activeGroup: params.group || "jobs",
        items: [],
        page: params.page || 1,
        hasMore: false,
      };
    }
  }
}
