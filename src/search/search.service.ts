import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { go } from "fuzzysort";
import { uniqBy } from "lodash";
import { QueryResult, RecordShape } from "neo4j-driver";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { paginate, slugify } from "src/shared/helpers";
import {
  PaginatedData,
  PillarInfo,
  ResponseWithOptionalData,
  SearchNav,
  SearchResult,
  SearchResultItem,
  SearchResultPillar,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { SearchPillarItemParams } from "./dto/search-pillar-items.input";
import { SearchPillarParams } from "./dto/search.input";

const NAV_PILLAR_QUERY_MAPPINGS: Record<
  SearchNav,
  Record<string, string> | null
> = {
  grants: {
    names:
      'MATCH (item:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Active"}) RETURN DISTINCT item.name as item',
    ecosystems:
      'MATCH (item:KarmaGapEcosystem)<-[:HAS_METADATA|HAS_ECOSYSTEM*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Active"}) RETURN DISTINCT item.name as item',
    chains:
      'MATCH (item:KarmaGapNetwork)<-[:HAS_METADATA|HAS_NETWORK*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Active"}) RETURN DISTINCT item.name as item',
    categories:
      'MATCH (item:KarmaGapCategory)<-[:HAS_METADATA|HAS_CATEGORY*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Active"}) RETURN DISTINCT item.name as item',
    organizations:
      'MATCH (item:KarmaGapOrganization)<-[:HAS_METADATA|HAS_ORGANIZATION*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Active"}) RETURN DISTINCT item.name as item',
  },
  grantsImpact: {
    names:
      'MATCH (item:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Inactive"}) RETURN DISTINCT item.name as item',
    ecosystems:
      'MATCH (item:KarmaGapEcosystem)<-[:HAS_METADATA|HAS_ECOSYSTEM*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Inactive"}) RETURN DISTINCT item.name as item',
    chains:
      'MATCH (item:KarmaGapNetwork)<-[:HAS_METADATA|HAS_NETWORK*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Inactive"}) RETURN DISTINCT item.name as item',
    categories:
      'MATCH (item:KarmaGapCategory)<-[:HAS_METADATA|HAS_CATEGORY*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Inactive"}) RETURN DISTINCT item.name as item',
    organizations:
      'MATCH (item:KarmaGapOrganization)<-[:HAS_METADATA|HAS_ORGANIZATION*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Inactive"}) RETURN DISTINCT item.name as item',
  },
  organizations: {
    names:
      "MATCH (organization:Organization) RETURN DISTINCT organization.name as item",
    investors:
      "MATCH (:Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor:Investor) RETURN DISTINCT investor.name as item",
    fundingRounds:
      "MATCH (:Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) RETURN DISTINCT funding_round.roundName as item",
    tags: "MATCH (:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag: Tag) WHERE NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation) RETURN DISTINCT tag.name as item",
  },
  projects: {
    names: "MATCH (project:Project) RETURN DISTINCT project.name as item",
    categories:
      "MATCH (:Project)-[:HAS_CATEGORY]->(category:ProjectCategory) RETURN DISTINCT category.name as item",
    tags: "MATCH (:Project)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag: Tag) WHERE NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation) RETURN DISTINCT tag.name as item",
    chains:
      "MATCH (:Project)-[:IS_DEPLOYED_ON]->(chain:Chain) RETURN DISTINCT chain.name as item",
    investors:
      "MATCH (:Project)<-[:HAS_PROJECT]-(:Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor:Investor) RETURN DISTINCT investor.name as item",
  },
  vcs: null,
};

@Injectable()
export class SearchService {
  private readonly logger = new CustomLogger(SearchService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  private async searchVCs(query: string): Promise<SearchResultPillar> {
    if (query) {
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
            link: `/projects/names/${slugify(record.get("name"))}`,
          })),
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
          names.records.map(record => ({
            value: record.get("name"),
            link: `/projects/names/${slugify(record.get("name"))}`,
          })),
          "value",
        ),
      };
    }
  }

  private async searchProjects(query: string): Promise<SearchResultPillar> {
    if (query) {
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
            link: `/projects/names/${slugify(record.get("name"))}`,
          })),
          "value",
        ),
        categories: uniqBy(
          categories.records.map(record => ({
            value: record.get("name"),
            link: `/projects/categories/${slugify(record.get("name"))}`,
          })),
          "value",
        ),
        tags,
      };
    } else {
      const [names, categories, tags] = await Promise.all([
        this.neogma.queryRunner.run(
          `
          MATCH (p:Project)
          RETURN p.name as name
          ORDER BY p.createdTimestamp DESC
          LIMIT 10
        `,
        ),
        this.neogma.queryRunner.run(
          `
          MATCH (c:ProjectCategory)
          MATCH (c)<-[:HAS_CATEGORY]-(p:Project)
          WITH c.name as name, COUNT(DISTINCT p) as popularity
          RETURN name
          ORDER BY popularity DESC
          LIMIT 10
        `,
        ),
        this.searchTags(query, "projects"),
      ]);
      return {
        names: uniqBy(
          names.records.map(record => ({
            value: record.get("name"),
            link: `/projects/names/${slugify(record.get("name"))}`,
          })),
          "value",
        ),
        categories: uniqBy(
          categories.records.map(record => ({
            value: record.get("name"),
            link: `/projects/categories/${slugify(record.get("name"))}`,
          })),
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
    let result: QueryResult<RecordShape>;

    if (group === "projects") {
      if (query) {
        result = await this.neogma.queryRunner.run(
          `
          CALL db.index.fulltext.queryNodes("tagNames", $query) YIELD node as tag
          WHERE (:Project)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag)
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
          MATCH (p:Project)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(t:Tag)
          WHERE NOT (t)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation)
          AND NOT (t)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
          WITH DISTINCT t, COUNT(DISTINCT p) AS popularity
          OPTIONAL MATCH (t)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
          OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(t)-[:IS_PAIR_OF]->(pair:Tag)
          WITH t, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others, popularity
          WITH CASE WHEN size(others) > 0 THEN head(others) ELSE t END AS canonicalTag, popularity
          WITH DISTINCT canonicalTag as t, popularity
          RETURN t.name as name
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
          MATCH (o:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(t:Tag)
          WHERE NOT (t)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation)
          AND NOT (t)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
          WITH DISTINCT t, COUNT(DISTINCT o) AS popularity
          OPTIONAL MATCH (t)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
          OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(t)-[:IS_PAIR_OF]->(pair:Tag)
          WITH t, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others, popularity
          WITH CASE WHEN size(others) > 0 THEN head(others) ELSE t END AS canonicalTag, popularity
          WITH DISTINCT canonicalTag as t, popularity
          RETURN t.name as name
          ORDER BY popularity DESC
          LIMIT 10
        `,
        );
      }
    }

    return uniqBy(
      result.records.map(record => ({
        value: record.get("name"),
        link: `/${group}/tags/${slugify(record.get("name"))}`,
      })),
      "value",
    );
  }

  private async searchOrganizations(
    query: string,
  ): Promise<SearchResultPillar> {
    if (query) {
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
            link: `/organizations/names/${slugify(record.get("name"))}`,
          })),
          "value",
        ),
        investors,
        fundingRounds,
        tags,
      };
    } else {
      const [names, investors, fundingRounds, tags] = await Promise.all([
        this.neogma.queryRunner.run(
          `
          MATCH (o:Organization)
          RETURN o.name as name
          ORDER BY o.createdTimestamp DESC
          LIMIT 10
        `,
        ),
        this.searchInvestors(query),
        this.searchFundingRounds(query),
        this.searchTags(query, "organizations"),
      ]);

      return {
        names: uniqBy(
          names.records.map(record => ({
            value: record.get("name"),
            link: `/organizations/names/${slugify(record.get("name"))}`,
          })),
          "value",
        ),
        investors,
        fundingRounds,
        tags,
      };
    }
  }

  private async searchGrants(
    query: string,
    status: "active" | "inactive",
  ): Promise<SearchResultPillar> {
    const statusFilter = status === "active" ? "Active" : "Inactive";

    if (query) {
      const [names, ecosystems, chains, categories, organizations] =
        await Promise.all([
          await this.neogma.queryRunner.run(
            `
          CALL db.index.fulltext.queryNodes("grants", $query) YIELD node as grant
          WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN grant.name as name
        `,
            { query, statusFilter },
          ),
          await this.neogma.queryRunner.run(
            `
          CALL db.index.fulltext.queryNodes("grantEcosystems", $query) YIELD node as ecosystem
          WHERE (ecosystem)<-[:HAS_METADATA|HAS_ECOSYSTEM*2]-(:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN ecosystem.name as ecosystem
        `,
            { query, statusFilter },
          ),
          this.neogma.queryRunner.run(
            `
          CALL db.index.fulltext.queryNodes("grantChains", $query) YIELD node as chain
          WHERE (chain)<-[:HAS_METADATA|HAS_NETWORK*2]-(:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN chain.name as chain
        `,
            { query, statusFilter },
          ),
          this.neogma.queryRunner.run(
            `
          CALL db.index.fulltext.queryNodes("grantCategories", $query) YIELD node as category
          WHERE (category)<-[:HAS_METADATA|HAS_CATEGORY*2]-(:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN category.name as category
        `,
            { query, statusFilter },
          ),
          this.neogma.queryRunner.run(
            `
          CALL db.index.fulltext.queryNodes("grantOrganizations", $query) YIELD node as organization
          WHERE (organization)<-[:HAS_METADATA|HAS_ORGANIZATION*2]-(:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN organization.name as organization
        `,
            { query, statusFilter },
          ),
        ]);

      return {
        names: uniqBy(
          names.records.map(record => ({
            value: record.get("name"),
            link: `/grants/names/${slugify(record.get("name"))}`,
          })),
          "value",
        ),
        ecosystems: uniqBy(
          ecosystems.records.map(record => ({
            value: record.get("ecosystem"),
            link: `/grants/ecosystems/${slugify(record.get("ecosystem"))}`,
          })),
          "value",
        ),
        chains: uniqBy(
          chains.records.map(record => ({
            value: record.get("chain"),
            link: `/grants/chains/${slugify(record.get("chain"))}`,
          })),
          "value",
        ),
        categories: uniqBy(
          categories.records.map(record => ({
            value: record.get("category"),
            link: `/grants/categories/${slugify(record.get("category"))}`,
          })),
          "value",
        ),
        organizations: uniqBy(
          organizations.records.map(record => ({
            value: record.get("organization"),
            link: `/grants/organizations/${slugify(
              record.get("organization"),
            )}`,
          })),
          "value",
        ),
      };
    } else {
      const [names, ecosystems, chains, categories, organizations] =
        await Promise.all([
          await this.neogma.queryRunner.run(
            `
          MATCH (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)
          WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN grant.name as name
          ORDER BY metadata.createdAt DESC
          LIMIT 10
        `,
            { statusFilter },
          ),
          await this.neogma.queryRunner.run(
            `
          MATCH (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)-[:HAS_ECOSYSTEM]->(ecosystem:KarmaGapEcosystem)
          WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN ecosystem.name as ecosystem
          ORDER BY metadata.createdAt DESC
          LIMIT 10
        `,
            { statusFilter },
          ),
          this.neogma.queryRunner.run(
            `
          MATCH (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)-[:HAS_NETWORK]->(chain:KarmaGapNetwork)
          WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN chain.name as chain
          ORDER BY metadata.createdAt DESC
          LIMIT 10
        `,
            { statusFilter },
          ),
          this.neogma.queryRunner.run(
            `
          MATCH (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)-[:HAS_CATEGORY]->(category:KarmaGapCategory)
          WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN category.name as category
          ORDER BY metadata.createdAt DESC
          LIMIT 10
        `,
            { statusFilter },
          ),
          this.neogma.queryRunner.run(
            `
          MATCH (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)-[:HAS_ORGANIZATION]->(organization:KarmaGapOrganization)
          WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: $statusFilter})
          RETURN organization.name as organization
          ORDER BY metadata.createdAt DESC
          LIMIT 10
        `,
            { statusFilter },
          ),
        ]);

      return {
        names: uniqBy(
          names.records.map(record => ({
            value: record.get("name"),
            link: `/grants/names/${slugify(record.get("name"))}`,
          })),
          "value",
        ),
        ecosystems: uniqBy(
          ecosystems.records.map(record => ({
            value: record.get("ecosystem"),
            link: `/grants/ecosystems/${slugify(record.get("ecosystem"))}`,
          })),
          "value",
        ),
        chains: uniqBy(
          chains.records.map(record => ({
            value: record.get("chain"),
            link: `/grants/chains/${slugify(record.get("chain"))}`,
          })),
          "value",
        ),
        categories: uniqBy(
          categories.records.map(record => ({
            value: record.get("category"),
            link: `/grants/categories/${slugify(record.get("category"))}`,
          })),
          "value",
        ),
        organizations: uniqBy(
          organizations.records.map(record => ({
            value: record.get("organization"),
            link: `/grants/organizations/${slugify(
              record.get("organization"),
            )}`,
          })),
          "value",
        ),
      };
    }
  }

  private async searchInvestors(query: string): Promise<SearchResultItem[]> {
    if (query) {
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
          link: `/organizations/investors/${slugify(record.get("name"))}`,
        })),
        "value",
      );
    } else {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (i:Investor)<-[:HAS_INVESTOR]-(f:FundingRound)
        WITH i.name as name, COUNT(DISTINCT f) as popularity
        RETURN name
        ORDER BY popularity DESC
        LIMIT 10
      `,
        { query },
      );
      return uniqBy(
        result.records.map(record => ({
          value: record.get("name"),
          link: `/organizations/investors/${slugify(record.get("name"))}`,
        })),
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
        CALL db.index.fulltext.queryNodes("rounds", $query) YIELD node as fundingRound
        RETURN fundingRound.roundName as name
      `,
        { query },
      );
      return uniqBy(
        result.records.map(record => ({
          value: record.get("name"),
          link: `/organizations/funding-rounds/${slugify(record.get("name"))}`,
        })),
        "value",
      );
    } else {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (f:FundingRound)<-[:HAS_FUNDING_ROUND]-(o:Organization)
        WITH f.roundName as name, COUNT(DISTINCT o) as popularity
        RETURN name
        ORDER BY popularity DESC
        LIMIT 10
      `,
      );
      return uniqBy(
        result.records.map(record => ({
          value: record.get("name"),
          link: `/organizations/funding-rounds/${slugify(record.get("name"))}`,
        })),
        "value",
      );
    }
  }

  async search(query: string): Promise<SearchResult> {
    try {
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

  async searchPillar(
    params: SearchPillarParams,
  ): Promise<ResponseWithOptionalData<PillarInfo>> {
    const query: string | undefined | null =
      NAV_PILLAR_QUERY_MAPPINGS[params.nav][params.pillar];
    const headerText = (
      await this.neogma.queryRunner.run(
        `
        MATCH (pillar:Pillar {nav: $nav, pillar: $pillar})
        RETURN {
          title: pillar.title,
          description: pillar.description
        } as text
      `,
        { nav: params.nav, pillar: params.pillar },
      )
    ).records[0]?.get("text") as { title: string; description: string };

    if (query && headerText) {
      const result = await this.neogma.queryRunner.run(query);
      const items = result.records.map(record => record.get("item"));
      const wanted = items.find(x => slugify(x) === params.item);
      const alts = Object.keys(NAV_PILLAR_QUERY_MAPPINGS[params.nav])
        .filter(x => x !== params.pillar)
        .map(x => {
          const query = NAV_PILLAR_QUERY_MAPPINGS[params.nav][x];
          return query ? [x, query] : null;
        })
        .filter(Boolean);
      const altPillars = await Promise.all(
        alts.map(async item => {
          const [altPillar, altQuery] = item;
          const result = await this.neogma.queryRunner.run(altQuery);
          const items = result.records.map(record => record.get("item"));
          return {
            slug: altPillar,
            items: items.filter(Boolean).slice(0, 20),
          };
        }),
      );
      if (
        !wanted ||
        items.length === 0 ||
        altPillars.every(x => x.items.length === 0)
      ) {
        return {
          success: false,
          message: "No result found",
        };
      } else {
        return {
          success: true,
          message: "Retrieved pillar info successfully",
          data: {
            ...headerText,
            activePillar: {
              slug: params.pillar,
              items: [
                wanted,
                ...items.filter(x => slugify(x) !== params.item).slice(0, 20),
              ].filter(Boolean),
            },
            altPillars,
          },
        };
      }
    } else {
      return {
        success: false,
        message: "Pillar not found",
      };
    }
  }

  async searchPillarItems(
    params: SearchPillarItemParams,
  ): Promise<PaginatedData<string>> {
    const query = NAV_PILLAR_QUERY_MAPPINGS[params.nav][params.pillar];
    if (query) {
      const result = await this.neogma.queryRunner.run(query);
      const items = result.records.map(record => record.get("item") as string);
      let results: string[];
      if (params.query) {
        results = go(params.query, items, {
          threshold: 0.3,
        }).map(x => x.target);
      } else {
        results = items;
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
  }
}
