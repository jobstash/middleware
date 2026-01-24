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
    tags: "CYPHER runtime = pipelined MATCH (:Organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag:Tag) WHERE NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation) RETURN DISTINCT tag.name as item",
  },
  projects: {
    names:
      "CYPHER runtime = pipelined MATCH (project:Project) RETURN DISTINCT project.name as item",
    categories:
      "CYPHER runtime = pipelined MATCH (:Project)-[:HAS_CATEGORY]->(category:ProjectCategory) RETURN DISTINCT category.name as item",
    organizations:
      "CYPHER runtime = pipelined MATCH (:Project)<-[:HAS_PROJECT]-(organization:Organization) RETURN DISTINCT organization.name as item",
    tags: "CYPHER runtime = pipelined MATCH (:Project)<-[:HAS_PROJECT|HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*5]->(tag:Tag) WHERE NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation) RETURN DISTINCT tag.name as item",
    chains:
      "CYPHER runtime = pipelined MATCH (:Project)-[:IS_DEPLOYED_ON]->(chain:Chain) RETURN DISTINCT chain.name as item",
    investors:
      "CYPHER runtime = pipelined MATCH (:Project)<-[:HAS_PROJECT]-(:Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor:Investor) RETURN DISTINCT investor.name as item",
  },
  jobs: {
    tags: "CYPHER runtime = pipelined MATCH (:Organization)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4]->(tag:Tag) WHERE NOT (tag)<-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation) RETURN DISTINCT tag.name as item",
    locations:
      "CYPHER runtime = pipelined MATCH (:Organization)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost) RETURN DISTINCT structured_jobpost.location as item",
    commitments:
      "CYPHER runtime = pipelined MATCH (:Organization)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_COMMITMENT]->(commitment:JobpostCommitment) RETURN DISTINCT commitment.name as item",
    locationTypes:
      "CYPHER runtime = pipelined MATCH (:Organization)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_LOCATION_TYPE]->(locationType:JobpostLocationType) RETURN DISTINCT locationType.name as item",
    classifications:
      "CYPHER runtime = pipelined MATCH (:Organization)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_CLASSIFICATION]->(classification:JobpostClassification) RETURN DISTINCT classification.name as item",
    organizations:
      "CYPHER runtime = pipelined MATCH (org:Organization)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation) RETURN DISTINCT org.name as item",
    investors:
      "CYPHER runtime = pipelined MATCH (org:Organization)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation) WITH DISTINCT org MATCH (org)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor:Investor) RETURN DISTINCT investor.name as item",
    fundingRounds:
      "CYPHER runtime = pipelined MATCH (org:Organization)<-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation) WITH DISTINCT org MATCH (org)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) RETURN DISTINCT funding_round.roundName as item",
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
  jobs: {
    tags: "Tags",
    locations: "Locations",
    commitments: "Commitments",
    locationTypes: "Location Types",
    classifications: "Classifications",
    organizations: "Organizations",
    investors: "Investors",
    fundingRounds: "Funding Rounds",
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
  jobs: [
    "classifications",
    "organizations",
    "tags",
    "locationTypes",
    "locations",
    "commitments",
    "investors",
    "fundingRounds",
  ],
  vcs: ["names"],
};

export const NAV_FILTER_CONFIGS: Record<SearchNav, string[] | null> = {
  projects: [
    "ecosystems",
    "ecosystems",
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
    "ecosystems",
    "ecosystems",
    "hasJobs",
    "hasProjects",
    "order",
    "orderBy",
  ],
  grants: ["date", "programBudget", "order", "orderBy"],
  impact: ["order", "orderBy"],
  jobs: [
    "tags",
    "locations",
    "commitments",
    "locationTypes",
    "classifications",
    "organizations",
    "investors",
    "fundingRounds",
  ],
  vcs: null,
};

export const NAV_PILLAR_TITLES: Record<SearchNav, string> = {
  grants: "Grant Program",
  impact: "Concluded Grant Program",
  organizations: "Organization",
  projects: "Project",
  jobs: "Job",
  vcs: "VC",
};

export const NAV_FILTER_CONFIG_QUERY_MAPPINGS: Record<
  SearchNav,
  string | null
> = {
  projects: `
    CYPHER runtime = pipelined
    MATCH (project:Project)
    WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((project)<-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
    RETURN {
      names: [project.name] + [(project)-[:HAS_PROJECT_ALIAS]->(alias:ProjectAlias) | alias.name],
      organizations: apoc.coll.toSet([(project)<-[:HAS_PROJECT]-(organization:Organization) | organization.name]),
      ecosystems: apoc.coll.toSet([(project)-[:IS_DEPLOYED_ON|HAS_ECOSYSTEM*2]->(ecosystem: Ecosystem) | ecosystem.name]),
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
        (project)<-[:HAS_PROJECT]-(organization)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_TAG]->(tag:Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
        WHERE (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | tag.name
      ])
    } as config
  `,
  organizations: `
    CYPHER runtime = pipelined
    MATCH (org:Organization)
    WHERE CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((org)<-[:IS_MEMBER_OF_ECOSYSTEM]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
    RETURN {
      names: [org.name] + [(org)-[:HAS_ORGANIZATION_ALIAS]->(alias:OrganizationAlias) | alias.name],
      chains: apoc.coll.toSet([(org)-[:HAS_PROJECT|IS_DEPLOYED_ON*2]->(chain:Chain) | chain.name]),
      locations: [org.location],
      investors: apoc.coll.toSet([(org)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor:Investor) | investor.name]),
      fundingRounds: apoc.coll.toSet([(org)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) | funding_round.roundName]),
      tags: apoc.coll.toSet([
        (org)-[:HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST*3]->(structured_jobpost:StructuredJobpost)-[:HAS_TAG]->(tag:Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
        WHERE (structured_jobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus) | tag.name
      ]),
      projects: apoc.coll.toSet([(org)-[:HAS_PROJECT]->(project:Project) | project.name]),
      ecosystems: apoc.coll.toSet([(org)-[:HAS_PROJECT|IS_DEPLOYED_ON|HAS_ECOSYSTEM*3]->(ecosystem:Ecosystem) | ecosystem.name]),
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
  jobs: `
    CYPHER runtime = pipelined
    MATCH (structured_jobpost:StructuredJobpost)-[:HAS_STATUS]->(:JobpostOnlineStatus)
    WHERE NOT (structured_jobpost)-[:HAS_JOB_DESIGNATION]->(:BlockedDesignation)
    AND CASE WHEN $ecosystem IS NULL THEN true ELSE EXISTS((structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE|HAS_ORGANIZATION|IS_MEMBER_OF_ECOSYSTEM*5]->(:OrganizationEcosystem {normalizedName: $ecosystem})) END
    MATCH (structured_jobpost)-[:HAS_TAG]->(tag:Tag)-[:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
      WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
      WITH DISTINCT tag, structured_jobpost
      OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)
      OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)
      WITH tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others, structured_jobpost
      WITH CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag, structured_jobpost
      WITH DISTINCT canonicalTag as tag, structured_jobpost
      WITH COLLECT(tag.name) as tags, structured_jobpost
    RETURN {
      tags: apoc.coll.toSet(tags),
      locations: [structured_jobpost.location],
      commitments: apoc.coll.toSet([(structured_jobpost)-[:HAS_COMMITMENT]->(commitment) | commitment.name]),
      locationTypes: apoc.coll.toSet([(structured_jobpost)-[:HAS_LOCATION_TYPE]->(locationType) | locationType.name]),
      classifications: apoc.coll.toSet([(structured_jobpost)-[:HAS_CLASSIFICATION]->(classification) | classification.name]),
      organizations: apoc.coll.toSet([(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(org:Organization) | org.name]),
      investors: apoc.coll.toSet([(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(org:Organization)-[:HAS_FUNDING_ROUND|HAS_INVESTOR*2]->(investor:Investor) | investor.name]),
      fundingRounds: apoc.coll.toSet([(structured_jobpost)<-[:HAS_STRUCTURED_JOBPOST|HAS_JOBPOST|HAS_JOBSITE*3]-(org:Organization)-[:HAS_FUNDING_ROUND]->(funding_round:FundingRound) | funding_round.roundName])
    } as config
  `,
  vcs: null,
};

export const NAV_PILLAR_SLUG_PREFIX_MAPPINGS: Record<
  SearchNav,
  Record<string, string>
> = {
  projects: {
    categories: "c",
    chains: "ch",
    organizations: "o",
    investors: "i",
    names: "p",
    tags: "t",
  },
  organizations: {
    locations: "l",
    investors: "i",
    fundingRounds: "fr",
    chains: "ch",
    names: "o",
    tags: "t",
    projects: "p",
  },
  grants: {
    names: "g",
    categories: "c",
    chains: "ch",
    ecosystems: "e",
    organizations: "o",
  },
  impact: {
    names: "i",
    categories: "c",
    chains: "ch",
    ecosystems: "e",
    organizations: "o",
  },
  vcs: {
    names: "v",
  },
  jobs: {
    classifications: "cl",
    locations: "l",
    tags: "t",
    commitments: "co",
    locationTypes: "lt",
    organizations: "o",
    investors: "i",
    fundingRounds: "fr",
  },
};
