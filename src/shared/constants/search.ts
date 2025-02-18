import { SearchNav } from "../interfaces";

export const NAV_PILLAR_QUERY_MAPPINGS: Record<
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
    projects:
      "CYPHER runtime = pipelined MATCH (:Organization)-[:HAS_PROJECT]->(project:Project) RETURN DISTINCT project.name as item",
    fundingRounds:
      "CYPHER runtime = pipelined MATCH (:Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) RETURN DISTINCT funding_round.roundName as item",
    tags: "CYPHER runtime = pipelined MATCH (:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag: Tag) WHERE NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation) RETURN DISTINCT tag.name as item",
  },
  projects: {
    names:
      "CYPHER runtime = pipelined MATCH (project:Project) RETURN DISTINCT project.name as item",
    categories:
      "CYPHER runtime = pipelined MATCH (:Project)-[:HAS_CATEGORY]->(category:ProjectCategory) RETURN DISTINCT category.name as item",
    organizations:
      "CYPHER runtime = pipelined MATCH (:Project)<-[:HAS_PROJECT]-(organization:Organization) RETURN DISTINCT organization.name as item",
    tags: "CYPHER runtime = pipelined MATCH (:Project)<-[:HAS_PROJECT|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*5]->(tag: Tag) WHERE NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation) RETURN DISTINCT tag.name as item",
    chains:
      "CYPHER runtime = pipelined MATCH (:Project)-[:IS_DEPLOYED_ON]->(chain:Chain) RETURN DISTINCT chain.name as item",
    investors:
      "CYPHER runtime = pipelined MATCH (:Project)<-[:HAS_PROJECT]-(:Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor:Investor) RETURN DISTINCT investor.name as item",
  },
  vcs: null,
};

export const NAV_FILTER_LABEL_MAPPINGS: Record<
  SearchNav,
  Record<string, string> | null
> = {
  projects: {
    categories: "Categories",
    chains: "Chains",
    organizations: "Organizations",
    investors: "Investors",
    names: "Projects",
    tags: "Tags",
  },
  organizations: {
    locations: "Locations",
    investors: "Investors",
    fundingRounds: "Funding Rounds",
    chains: "Chains",
    names: "Organizations",
    tags: "Tags",
    projects: "Projects",
  },
  grants: {
    names: "Grants",
    categories: "Categories",
    chains: "Chains",
    ecosystems: "Ecosystems",
    organizations: "Organizations",
  },
  impact: {
    names: "Impact",
    categories: "Categories",
    chains: "Chains",
    ecosystems: "Ecosystems",
    organizations: "Organizations",
  },
  vcs: null,
};

export const NAV_PILLAR_ORDERING: Record<SearchNav, string[]> = {
  grants: ["categories", "chains", "ecosystems", "organizations", "names"],
  impact: ["categories", "chains", "ecosystems", "organizations", "names"],
  organizations: [
    "investors",
    "locations",
    "projects",
    "chains",
    "fundingRounds",
    "names",
    "tags",
  ],
  projects: [
    "categories",
    "chains",
    "organizations",
    "investors",
    "names",
    "tags",
  ],
  vcs: ["names"],
};

export const NAV_FILTER_CONFIGS: Record<SearchNav, string[] | null> = {
  projects: [
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

export const NAV_PILLAR_TITLES: Record<SearchNav, string> = {
  grants: "Grant Program",
  impact: "Concluded Grant Program",
  organizations: "Organization",
  projects: "Project",
  vcs: "VC",
};

export const NAV_FILTER_CONFIG_QUERY_MAPPINGS: Record<
  SearchNav,
  string | null
> = {
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
        (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_TAG]->(tag: Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
        WHERE (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | tag.name
      ]),
      projects: apoc.coll.toSet([(org)-[:HAS_PROJECT]->(project:Project) | project.name]),
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
      names: [grant.name],
      categories: apoc.coll.toSet([(metadata)-[:HAS_CATEGORY]->(category) | category.name]),
      chains: apoc.coll.toSet([(metadata)-[:HAS_NETWORK]->(network) | network.name]),
      ecosystems: apoc.coll.toSet([(metadata)-[:HAS_ECOSYSTEM]->(ecosystem) | ecosystem.name]),
      organizations: apoc.coll.toSet([(metadata)-[:HAS_ORGANIZATION]->(organization) | organization.name])
    } as config
  `,
  impact: `
    CYPHER runtime = pipelined
    MATCH (grant:KarmaGapProgram)-[:HAS_METADATA]->(metadata:KarmaGapProgramMetadata)
    WHERE (grant)-[:HAS_STATUS]->(:KarmaGapStatus {name: 'Inactive'})
    
    RETURN {
      categories: apoc.coll.toSet([(metadata)-[:HAS_CATEGORY]->(category) | category.name]),
      chains: apoc.coll.toSet([(metadata)-[:HAS_NETWORK]->(network) | network.name]),
      ecosystems: apoc.coll.toSet([(metadata)-[:HAS_ECOSYSTEM]->(ecosystem) | ecosystem.name]),
      organizations: apoc.coll.toSet([(metadata)-[:HAS_ORGANIZATION]->(organization) | organization.name]),
      names: [grant.name]
    } as config
  `,
  vcs: null,
};
