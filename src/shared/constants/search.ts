import { SearchNav } from "../interfaces";

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
    seniority: "Seniority",
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
    "seniority",
    "investors",
    "fundingRounds",
  ],
  vcs: ["names"],
};

export const NAV_FILTER_CONFIGS: Record<SearchNav, string[] | null> = {
  projects: [
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
    "seniority",
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
  vcs: { names: "v" },
  jobs: {
    classifications: "cl",
    locations: "l",
    tags: "t",
    commitments: "co",
    locationTypes: "lt",
    seniority: "s",
    organizations: "o",
    investors: "i",
    fundingRounds: "fr",
    booleans: "b",
  },
};
