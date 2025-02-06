import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { go } from "fuzzysort";
import { capitalize, lowerCase, max, min, uniq, uniqBy } from "lodash";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { intConverter, paginate, slugify } from "src/shared/helpers";
import {
  MultiSelectFilter,
  PaginatedData,
  PillarInfo,
  RangeFilter,
  ResponseWithOptionalData,
  SearchNav,
  SearchResult,
  SearchResultItem,
  SearchResultNav,
  SelectFilter,
  SingleSelectFilter,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { SearchPillarItemParams } from "./dto/search-pillar-items.input";
import { SearchPillarParams } from "./dto/search-pillar.input";
import { FetchPillarItemLabelsInput } from "./dto/fetch-pillar-item-labels.input";
import { SearchParams } from "./dto/search.input";
import { QueryResult } from "neo4j-driver-core";
import { SearchPillarFiltersParams } from "./dto/search-pillar-filters-params.input";
import {
  FILTER_CONFIG_PRESETS,
  FILTER_PARAM_KEY_PRESETS,
  FILTER_PARAM_KEY_REVERSE_PRESETS,
} from "src/shared/presets/search-filter-configs";
import { createNewSortInstance } from "fast-sort";

const NAV_PILLAR_QUERY_MAPPINGS: Record<
  SearchNav,
  Record<string, string> | null
> = {
  grants: {
    names:
      'CYPHER runtime = pipelined MATCH (item:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Active"}) RETURN DISTINCT item.name as item',
    ecosystems:
      'CYPHER runtime = pipelined MATCH (item:KarmaGapEcosystem)<-[:HAS_METADATA|HAS_ECOSYSTEM*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Active"}) RETURN DISTINCT item.name as item',
    chains:
      'CYPHER runtime = pipelined MATCH (item:KarmaGapNetwork)<-[:HAS_METADATA|HAS_NETWORK*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Active"}) RETURN DISTINCT item.name as item',
    categories:
      'CYPHER runtime = pipelined MATCH (item:KarmaGapCategory)<-[:HAS_METADATA|HAS_CATEGORY*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Active"}) RETURN DISTINCT item.name as item',
    organizations:
      'CYPHER runtime = pipelined MATCH (item:KarmaGapOrganization)<-[:HAS_METADATA|HAS_ORGANIZATION*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Active"}) RETURN DISTINCT item.name as item',
  },
  impact: {
    names:
      'CYPHER runtime = pipelined MATCH (item:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Inactive"}) RETURN DISTINCT item.name as item',
    ecosystems:
      'CYPHER runtime = pipelined MATCH (item:KarmaGapEcosystem)<-[:HAS_METADATA|HAS_ECOSYSTEM*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Inactive"}) RETURN DISTINCT item.name as item',
    chains:
      'CYPHER runtime = pipelined MATCH (item:KarmaGapNetwork)<-[:HAS_METADATA|HAS_NETWORK*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Inactive"}) RETURN DISTINCT item.name as item',
    categories:
      'CYPHER runtime = pipelined MATCH (item:KarmaGapCategory)<-[:HAS_METADATA|HAS_CATEGORY*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Inactive"}) RETURN DISTINCT item.name as item',
    organizations:
      'CYPHER runtime = pipelined MATCH (item:KarmaGapOrganization)<-[:HAS_METADATA|HAS_ORGANIZATION*2]-(grant:KarmaGapProgram)-[:HAS_STATUS]->(:KarmaGapStatus {name: "Inactive"}) RETURN DISTINCT item.name as item',
  },
  organizations: {
    names:
      "CYPHER runtime = pipelined MATCH (organization:Organization) RETURN DISTINCT organization.name as item",
    chains:
      "CYPHER runtime = pipelined MATCH (organization:Organization)-[:HAS_PROJECT|IS_DEPLOYED_ON*2]->(chain:Chain) RETURN DISTINCT chain.name as item",
    locations:
      "CYPHER runtime = pipelined MATCH (organization:Organization) RETURN DISTINCT organization.location as item",
    investors:
      "CYPHER runtime = pipelined MATCH (:Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor:Investor) RETURN DISTINCT investor.name as item",
    fundingRounds:
      "CYPHER runtime = pipelined MATCH (:Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) RETURN DISTINCT funding_round.roundName as item",
    tags: "CYPHER runtime = pipelined MATCH (:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag: Tag) WHERE NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation) RETURN DISTINCT tag.name as item",
  },
  projects: {
    names:
      "CYPHER runtime = pipelined MATCH (project:Project) RETURN DISTINCT project.name as item",
    categories:
      "CYPHER runtime = pipelined MATCH (:Project)-[:HAS_CATEGORY]->(category:ProjectCategory) RETURN DISTINCT category.name as item",
    tags: "CYPHER runtime = pipelined MATCH (:Project)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag: Tag) WHERE NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation) RETURN DISTINCT tag.name as item",
    chains:
      "CYPHER runtime = pipelined MATCH (:Project)-[:IS_DEPLOYED_ON]->(chain:Chain) RETURN DISTINCT chain.name as item",
    investors:
      "CYPHER runtime = pipelined MATCH (:Project)<-[:HAS_PROJECT]-(:Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor:Investor) RETURN DISTINCT investor.name as item",
  },
  vcs: null,
};

const NAV_PILLAR_ORDERING: Record<SearchNav, string[]> = {
  grants: ["categories", "chains", "ecosystems", "organizations", "names"],
  impact: ["categories", "chains", "ecosystems", "organizations", "names"],
  organizations: [
    "investors",
    "locations",
    "chains",
    "fundingRounds",
    "names",
    "tags",
  ],
  projects: ["categories", "chains", "investors", "names", "tags"],
  vcs: ["names"],
};

const NAV_FILTER_CONFIGS: Record<SearchNav, string[] | null> = {
  projects: [
    "organizations",
    "ecosystems",
    "communities",
    "tvl",
    "monthlyVolume",
    "monthlyFees",
    "monthlyRevenue",
    "audits",
    "hacks",
    "token",
    "order",
    "orderBy",
  ],
  organizations: [
    "headCount",
    "communities",
    "ecosystems",
    "hasJobs",
    "hasProjects",
    "order",
    "orderBy",
  ],
  grants: ["date", "programBudget", "order", "orderBy"],
  impact: ["order", "orderBy"],
  vcs: null,
};

const NAV_PILLAR_TITLES: Record<SearchNav, string> = {
  grants: "Grant Program",
  impact: "Concluded Grant Program",
  organizations: "Organization",
  projects: "Project",
  vcs: "VC",
};

const NAV_FILTER_CONFIG_QUERY_MAPPINGS: Record<SearchNav, string | null> = {
  projects: `
    CYPHER runtime = pipelined
    MATCH (project:Project)
    WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((project)<-[:HAS_PROJECT|IS_MEMBER_OF_COMMUNITY*2]->(:OrganizationCommunity {normalizedName: $community})) END
    RETURN {
      names: [project.name] + [(project)-[:HAS_PROJECT_ALIAS]->(alias:ProjectAlias) | alias.name],
      organizations: apoc.coll.toSet([(project)<-[:HAS_PROJECT]-(organization:Organization) | organization.name]),
      ecosystems: apoc.coll.toSet([(project)-[:IS_DEPLOYED_ON|HAS_ECOSYSTEM*2]->(ecosystem: Ecosystem) | ecosystem.name]),
      communities: apoc.coll.toSet([(project)<-[:HAS_PROJECT|IS_MEMBER_OF_COMMUNITY*2]->(community: OrganizationCommunity) | community.name]),
      tvl: project.tvl,
      monthlyFees: project.monthlyFees,
      monthlyVolume: project.monthlyVolume,
      monthlyRevenue: project.monthlyRevenue,
      audits: CASE WHEN EXISTS((project)-[:HAS_AUDIT]->(:Audit)) THEN true ELSE false END,
      hacks: CASE WHEN EXISTS((project)-[:HAS_HACK]->(:Hack)) THEN true ELSE false END,
      token: CASE WHEN project.tokenAddress IS NOT NULL THEN true ELSE false END,
      categories: apoc.coll.toSet([(project)-[:HAS_CATEGORY]->(category:ProjectCategory) | category.name]),
      chains: apoc.coll.toSet([(project)-[:IS_DEPLOYED_ON]->(chain:Chain) | chain.name]),
      ecosystems: apoc.coll.toSet([(project)-[:IS_DEPLOYED_ON|HAS_ECOSYSTEM*2]->(ecosystem: Ecosystem) | ecosystem.name]),
      investors: apoc.coll.toSet([(project)<-[:HAS_PROJECT]-(organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor: Investor) | investor.name]),
      tags: apoc.coll.toSet([
        (project)<-[:HAS_PROJECT]-(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
        WHERE (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | tag.name
      ])
    } as config
  `,
  organizations: `
    CYPHER runtime = pipelined
    MATCH (org:Organization)
    WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)<-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
    RETURN {
      names: [org.name] + [(org)-[:HAS_ORGANIZATION_ALIAS]->(alias:OrganizationAlias) | alias.name],
      chains: apoc.coll.toSet([(org)-[:HAS_PROJECT|IS_DEPLOYED_ON*2]->(chain:Chain) | chain.name]),
      locations: [org.location],
      investors: apoc.coll.toSet([(org)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor:Investor) | investor.name]),
      fundingRounds: apoc.coll.toSet([(org)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) | funding_round.roundName]),
      tags: apoc.coll.toSet([
        (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
        WHERE (tag)-[:HAS_STATUS]->(:JobpostOnlineStatus) | tag.name
      ]),
      communities: apoc.coll.toSet([(org)-[:IS_MEMBER_OF_COMMUNITY]->(community:OrganizationCommunity) | community.name]),
      ecosystems: apoc.coll.toSet([(org)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem: Ecosystem) | ecosystem.name]),
      headCount: org.headcountEstimate,
      hasProjects: CASE WHEN EXISTS((org)-[:HAS_PROJECT]->(:Project)) THEN true ELSE false END,
      hasJobs: CASE WHEN EXISTS((org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)) THEN true ELSE false END
    } as config
  `,
  grants: `
    CYPHER runtime = pipelined
    MATCH (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)
    WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: 'Active'})
    
    RETURN {
      date: metadata.startsAt,
      programBudget: metadata.programBudget,
      names: [grant.name]
      categories: apoc.coll.toSet([(metadata)-[:HAS_CATEGORY]->(category) | category.name]),
      chains: apoc.coll.toSet([(metadata)-[:HAS_NETWORKS]->(network) | network.name]),
      ecosystems: apoc.coll.toSet([(metadata)-[:HAS_ECOSYSTEM]->(ecosystem) | ecosystem.name]),
      organizations: apoc.coll.toSet([(metadata)-[:HAS_ORGANIZATION]->(organization) | organization.name]),
    } as config
  `,
  impact: `
    CYPHER runtime = pipelined
    MATCH (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)
    WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: 'Inactive'})
    
    RETURN {
      categories: apoc.coll.toSet([(metadata)-[:HAS_CATEGORY]->(category) | category.name]),
      chains: apoc.coll.toSet([(metadata)-[:HAS_NETWORKS]->(network) | network.name]),
      ecosystems: apoc.coll.toSet([(metadata)-[:HAS_ECOSYSTEM]->(ecosystem) | ecosystem.name]),
      organizations: apoc.coll.toSet([(metadata)-[:HAS_ORGANIZATION]->(organization) | organization.name]),
      names: [grant.name]
    } as config
  `,
  vcs: null,
};

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
      const [names, categories, chains, investors, tags] = await Promise.all([
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
      const [names, categories, chains, investors, tags] = await Promise.all([
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
    let result;

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
          CYPHER runtime = parallel
          MATCH (p:Project)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(t:Tag)
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
      const [names, locations, investors, fundingRounds, chains, tags] =
        await Promise.all([
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
      const [names, locations, investors, fundingRounds, chains, tags] =
        await Promise.all([
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
    let result;

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
          const keys = Object.keys(NAV_PILLAR_QUERY_MAPPINGS[nav]);
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
    } else {
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
  }

  async searchPillar(
    params: SearchPillarParams,
  ): Promise<ResponseWithOptionalData<PillarInfo>> {
    const pillar = params.pillar ?? NAV_PILLAR_ORDERING[params.nav][0];
    const query: string | undefined | null =
      NAV_PILLAR_QUERY_MAPPINGS[params.nav][pillar];
    const headerText = await this.fetchHeaderText(
      params.nav,
      pillar,
      params.item,
    );
    if (query && headerText) {
      const result = await this.neogma.queryRunner.run(query);
      const items = result.records?.map(record => record.get("item"));
      const wanted = items.find(x => slugify(x) === params.item);
      const alts = NAV_PILLAR_ORDERING[params.nav]
        .filter(x => x !== pillar)
        .map(x => {
          const query = NAV_PILLAR_QUERY_MAPPINGS[params.nav][x];
          return query ? [x, query] : null;
        })
        .filter(Boolean);
      const altPillars = await Promise.all(
        alts.map(async item => {
          const [altPillar, altQuery] = item;
          const result = await this.neogma.queryRunner.run(altQuery);
          const items = result.records?.map(record => record.get("item"));
          return {
            slug: altPillar,
            items: items.filter(Boolean).slice(0, 20),
          };
        }),
      );
      if (
        (params.item ? !wanted : false) ||
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
              slug: pillar,
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
      const items = result.records?.map(record => record.get("item") as string);
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

  async fetchPillarItemLabels(
    params: FetchPillarItemLabelsInput,
  ): Promise<ResponseWithOptionalData<{ slug: string; label: string }[]>> {
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
        success: false,
        message: "Pillar not found",
      };
    }
  }

  async searchPillarFilters(
    params: SearchPillarFiltersParams,
    community: string | undefined,
  ): Promise<ResponseWithOptionalData<(RangeFilter | SelectFilter)[]>> {
    try {
      const query = NAV_FILTER_CONFIG_QUERY_MAPPINGS[params.nav];

      if (query) {
        const result = await this.neogma.queryRunner.run(query, {
          community: community ?? null,
        });

        const passedFilters = Object.keys(params).filter(
          x => x !== "nav" && params[x] !== null,
        );

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

        const validPassedFilters = passedFilters.filter(x =>
          validNavFilters.map(y => y.paramKey).includes(x),
        );

        const configData = result.records?.map(record => record.get("config"));

        let data: (RangeFilter | SelectFilter)[];

        const sort = createNewSortInstance({
          comparer: new Intl.Collator(undefined, {
            numeric: true,
            caseFirst: "lower",
            sensitivity: "case",
          }).compare,
          inPlaceSorting: true,
        });

        const isValidFilterConfig = (value: string): boolean =>
          value !== "unspecified" &&
          value !== "undefined" &&
          value !== "" &&
          value !== "null" &&
          value !== null &&
          value !== undefined;

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
          const filtered = configData.filter(x => {
            return validPassedFilters.reduce((acc, curr) => {
              let current: boolean;
              const value =
                x[FILTER_PARAM_KEY_REVERSE_PRESETS[params.nav][curr]];
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
          });

          data = [
            ...navFilters.map(x => {
              const presets = FILTER_CONFIG_PRESETS[params.nav][x];
              if (!presets) {
                return null;
              }
              if (presets.kind === "RANGE") {
                return new RangeFilter({
                  value: {
                    lowest: {
                      value:
                        intConverter(
                          min(filtered.flatMap(y => y[x]).filter(Boolean)),
                        ) ?? 0,
                      paramKey: FILTER_PARAM_KEY_PRESETS[params.nav][x].lowest,
                    },
                    highest: {
                      value:
                        intConverter(
                          max(filtered.flatMap(y => y[x]).filter(Boolean)),
                        ) ?? 0,
                      paramKey: FILTER_PARAM_KEY_PRESETS[params.nav][x].highest,
                    },
                  },
                  ...presets,
                });
              } else {
                if (presets.kind === "SINGLE_SELECT") {
                  return new SingleSelectFilter({
                    options: sort(
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
                    options: sort(
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
                return new RangeFilter({
                  value: {
                    lowest: {
                      value:
                        intConverter(
                          min(configData.flatMap(y => y[x]).filter(Boolean)),
                        ) ?? 0,
                      paramKey: FILTER_PARAM_KEY_PRESETS[params.nav][x].lowest,
                    },
                    highest: {
                      value:
                        intConverter(
                          max(configData.flatMap(y => y[x]).filter(Boolean)),
                        ) ?? 0,
                      paramKey: FILTER_PARAM_KEY_PRESETS[params.nav][x].highest,
                    },
                  },
                  ...presets,
                });
              } else {
                if (presets.kind === "SINGLE_SELECT") {
                  return new SingleSelectFilter({
                    options: sort(
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
                    options: sort(
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
          success: false,
          message: "Filter config not found",
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
}
