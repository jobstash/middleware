import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { go } from "fuzzysort";
import { capitalize, lowerCase, uniqBy } from "lodash";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { paginate, slugify } from "src/shared/helpers";
import {
  FilterConfigResponse,
  PaginatedData,
  PillarInfo,
  ResponseWithOptionalData,
  SearchNav,
  SearchResult,
  SearchResultItem,
  SearchResultNav,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { SearchPillarItemParams } from "./dto/search-pillar-items.input";
import { SearchPillarParams } from "./dto/search-pillar.input";
import { FetchPillarItemLabelsInput } from "./dto/fetch-pillar-item-labels.input";
import { SearchParams } from "./dto/search.input";

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

const NAV_PILLAR_DEFAULTS: Record<SearchNav, string> = {
  grants: "names",
  impact: "names",
  organizations: "locations",
  projects: "categories",
  vcs: "vcs",
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
    RETURN {
      maxTvl: apoc.coll.max([
        (org)-[:HAS_PROJECT]->(project:Project)
        WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
        AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
        AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.tvl
      ]),
      minTvl: apoc.coll.min([
        (org)-[:HAS_PROJECT]->(project:Project)
        WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
        AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
        AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.tvl
      ]),
      minMonthlyVolume: apoc.coll.min([
        (org)-[:HAS_PROJECT]->(project:Project)
        WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
        AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
        AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyVolume
      ]),
      maxMonthlyVolume: apoc.coll.max([
        (org)-[:HAS_PROJECT]->(project:Project)
        WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
        AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
        AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyVolume
      ]),
      minMonthlyFees: apoc.coll.max([
        (org)-[:HAS_PROJECT]->(project:Project)
        WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
        AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
        AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyFees
      ]),
      maxMonthlyFees: apoc.coll.max([
        (org)-[:HAS_PROJECT]->(project:Project)
        WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
        AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
        AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyFees
      ]),
      minMonthlyRevenue: apoc.coll.max([
        (org)-[:HAS_PROJECT]->(project:Project)
        WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
        AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
        AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyRevenue
      ]),
      maxMonthlyRevenue: apoc.coll.max([
        (org)-[:HAS_PROJECT]->(project:Project)
        WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
        AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus)
        AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation) | project.monthlyRevenue
      ]),
      communities: apoc.coll.toSet([
        (org: Organization)-[:IS_MEMBER_OF_COMMUNITY]->(community: OrganizationCommunity)
        WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
        AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
        AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | community.name
      ]),
      ecosystems: apoc.coll.toSet([
        (org: Organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem: Ecosystem)
        WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
        AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
        AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | ecosystem.name
      ])
    }
  `,
  organizations: `
    CYPHER runtime = pipelined
    RETURN {
      minHeadCount: apoc.coll.min([
        (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) 
        WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END | org.headcountEstimate
      ]),
      maxHeadCount: apoc.coll.max([
        (org:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) 
        WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END | org.headcountEstimate
      ]),
      communities: apoc.coll.toSet([
        (org: Organization)-[:IS_MEMBER_OF_COMMUNITY]->(community: OrganizationCommunity)
        WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
        AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
        AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | community.name
      ]),
      ecosystems: apoc.coll.toSet([
        (org: Organization)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem: Ecosystem)
        WHERE CASE WHEN $community IS NULL THEN true ELSE EXISTS((org)-[:IS_MEMBER_OF_COMMUNITY]->(:OrganizationCommunity {normalizedName: $community})) END
        AND NOT (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_JOB_DESIGNATION*4]->(:BlockedDesignation)
        AND (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_STATUS*4]->(:JobpostOnlineStatus) | ecosystem.name
      ])
    }
  `,
  grants: `
    CYPHER runtime = pipelined
    RETURN {
      minMatchAmount: apoc.coll.min([
        (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)
        WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: 'Active'}) | metadata.programBudget
      ]),
      maxMatchAmount: apoc.coll.max([
        (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)
        WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: 'Active'}) | metadata.programBudget
      ]),
      minDonatedAmount: apoc.coll.min([
        (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)
        WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: 'Active'}) | metadata.amountDistributedToDate
      ]),
      maxDonatedAmount: apoc.coll.max([
        (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)
        WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: 'Active'}) | metadata.amountDistributedToDate
      ]),
      minPayoutTime: apoc.coll.min([
        (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)
        WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: 'Active'})
        AND metadata.amountDistributedToDate IS NOT NULL | metadata.payoutTime
      ]),
      maxPayoutTime: apoc.coll.max([
        (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)
        WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: 'Active'})
        AND metadata.amountDistributedToDate IS NOT NULL | metadata.payoutTime
      ])
    }
  `,
  grantsImpact: `
    //matchAmount
    //donatedAmount
    //payoutTime
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
      const [names, categories, chains, tags] = await Promise.all([
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
        this.searchTags(query, "projects"),
      ]);
      return {
        names: uniqBy(
          names.records?.map(record => ({
            value: record.get("name"),
            link: `/projects/names/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        categories: uniqBy(
          categories.records?.map(record => ({
            value: record.get("name"),
            link: `/projects/categories/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        chains,
        tags,
      };
    } else {
      const [names, categories, chains, tags] = await Promise.all([
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
        this.searchTags(query, "projects"),
      ]);
      return {
        names: uniqBy(
          names.records?.map(record => ({
            value: record.get("name"),
            link: `/projects/names/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        categories: uniqBy(
          categories.records?.map(record => ({
            value: record.get("name"),
            link: `/projects/categories/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        chains,
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
          this.searchInvestors(query),
          this.searchFundingRounds(query),
          this.searchChains(query, "organizations"),
          this.searchTags(query, "organizations"),
        ]);

      return {
        names: uniqBy(
          names.records?.map(record => ({
            value: record.get("name"),
            link: `/organizations/names/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        locations: uniqBy(
          locations.records?.map(record => ({
            value: record.get("location"),
            link: `/organizations/locations/${slugify(record.get("location"))}`,
          })) ?? [],
          "value",
        ),
        investors,
        fundingRounds,
        chains,
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
          this.searchInvestors(query),
          this.searchFundingRounds(query),
          this.searchChains(query, "organizations"),
          this.searchTags(query, "organizations"),
        ]);

      return {
        names: uniqBy(
          names.records?.map(record => ({
            value: record.get("name"),
            link: `/organizations/names/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        locations: uniqBy(
          locations.records?.map(record => ({
            value: record.get("location"),
            link: `/organizations/locations/${slugify(record.get("location"))}`,
          })) ?? [],
          "value",
        ),
        investors,
        fundingRounds,
        chains,
        tags,
      };
    }
  }

  private async searchGrants(
    query: string,
    status: "active" | "inactive",
  ): Promise<SearchResultNav> {
    const statusFilter = status === "active" ? "Active" : "Inactive";

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
        names: uniqBy(
          names.records?.map(record => ({
            value: record.get("name"),
            link: `/grants/names/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        ecosystems: uniqBy(
          ecosystems.records?.map(record => ({
            value: record.get("ecosystem"),
            link: `/grants/ecosystems/${slugify(record.get("ecosystem"))}`,
          })) ?? [],
          "value",
        ),
        chains: uniqBy(
          chains.records?.map(record => ({
            value: record.get("chain"),
            link: `/grants/chains/${slugify(record.get("chain"))}`,
          })) ?? [],
          "value",
        ),
        categories: uniqBy(
          categories.records?.map(record => ({
            value: record.get("category"),
            link: `/grants/categories/${slugify(record.get("category"))}`,
          })) ?? [],
          "value",
        ),
        organizations: uniqBy(
          organizations.records?.map(record => ({
            value: record.get("organization"),
            link: `/grants/organizations/${slugify(
              record.get("organization"),
            )}`,
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
        names: uniqBy(
          names.records?.map(record => ({
            value: record.get("name"),
            link: `/grants/names/${slugify(record.get("name"))}`,
          })) ?? [],
          "value",
        ),
        ecosystems: uniqBy(
          ecosystems.records?.map(record => ({
            value: record.get("ecosystem"),
            link: `/grants/ecosystems/${slugify(record.get("ecosystem"))}`,
          })) ?? [],
          "value",
        ),
        chains: uniqBy(
          chains.records?.map(record => ({
            value: record.get("chain"),
            link: `/grants/chains/${slugify(record.get("chain"))}`,
          })) ?? [],
          "value",
        ),
        categories: uniqBy(
          categories.records?.map(record => ({
            value: record.get("category"),
            link: `/grants/categories/${slugify(record.get("category"))}`,
          })) ?? [],
          "value",
        ),
        organizations: uniqBy(
          organizations.records?.map(record => ({
            value: record.get("organization"),
            link: `/grants/organizations/${slugify(
              record.get("organization"),
            )}`,
          })) ?? [],
          "value",
        ),
      };
    }
  }

  private async searchInvestors(query: string): Promise<SearchResultItem[]> {
    if (query) {
      const result = await this.neogma.queryRunner.run(
        `
        CALL db.index.fulltext.queryNodes("investors", $query) YIELD node as investor, score
        RETURN DISTINCT investor.name as name, score
        ORDER BY score DESC
        LIMIT 10
      `,
        { query },
      );
      return uniqBy(
        result.records?.map(record => ({
          value: record.get("name"),
          link: `/organizations/investors/${slugify(record.get("name"))}`,
        })) ?? [],
        "value",
      );
    } else {
      const result = await this.neogma.queryRunner.run(
        `
        CYPHER runtime = parallel
        MATCH (i:Investor)<-[:HAS_INVESTOR]-(f:FundingRound)
        WITH i.name as name, f
        RETURN DISTINCT name, COUNT(f) as popularity
        ORDER BY popularity DESC
        LIMIT 10
      `,
        { query },
      );
      return uniqBy(
        result.records?.map(record => ({
          value: record.get("name"),
          link: `/organizations/investors/${slugify(record.get("name"))}`,
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
    const pillar = basePillar ?? NAV_PILLAR_DEFAULTS[nav];
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
    const pillar = params.pillar ?? NAV_PILLAR_DEFAULTS[params.nav];
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
      const alts = Object.keys(NAV_PILLAR_QUERY_MAPPINGS[params.nav])
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
          success: false,
          message: "No result found",
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

  async getFilterConfigs(
    nav: SearchNav,
  ): Promise<FilterConfigResponse["data"]> {}

  async searchPillarFilters(nav: SearchNav): Promise<FilterConfigResponse> {
    const query = NAV_FILTER_CONFIG_QUERY_MAPPINGS[nav];

    const result = await this.neogma.queryRunner.run(query);

    const data = result.records.map(
      record => record.get("res") as FilterConfig,
    );
    return {
      success: true,
      message: "Retrieved filter configs successfully",
      data,
    };
  }
}
