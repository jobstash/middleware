export type PeopleBucket = "month" | "quarter" | "year";
export type DeveloperCohort = "crypto" | "fintech" | "ai" | "banking" | "tech";
export type PeopleMetric =
  | "activePeople"
  | "affiliatedPeople"
  | "activeMaintainers"
  | "activeLeads"
  | "joins"
  | "exits"
  | "movements"
  | "activity"
  | "commits"
  | "merges";

export type PeopleOverview = {
  available: boolean;
  asOf: string | null;
  bucket: PeopleBucket;
  points: Array<{
    period: string;
    activePeople: number;
    activeMaintainers: number;
    activeLeads: number;
    activeOrganizations: number;
    joins: number;
    exits: number;
    returns: number;
    movements: number;
    activityCount: number;
    commitCount: number;
    mergeCount: number;
  }>;
};

export type DeveloperReportPoint = PeopleOverview["points"][number] & {
  oneDayPeople: number;
  regularPeople: number;
  sustainedPeople: number;
  newPeople: number;
  establishedPeople: number;
  longTenuredPeople: number;
};

export type DeveloperReport = {
  available: boolean;
  asOf: string | null;
  completeThrough: string | null;
  methodologyVersion: "developer-report-v1";
  selectedCohort: DeveloperCohort;
  cohorts: Array<{
    cohort: DeveloperCohort;
    label: string;
    activePeople: number;
    activeMaintainers: number;
    activeOrganizations: number;
  }>;
  population: {
    label: string;
    definition: string;
    excludes: string[];
  };
  current: DeveloperReportPoint | null;
  history: DeveloperReportPoint[];
  retention: Array<{
    cohortMonth: string;
    cohortSize: number;
    retainedMonth3: number;
    retainedMonth6: number;
    retainedMonth12: number;
  }>;
  maintainerLeverage: {
    period: string | null;
    maintainerCount: number;
    mergedPrCount: number;
    medianAuthorsSupported: number | null;
    p25AuthorsSupported: number | null;
    p75AuthorsSupported: number | null;
  };
  organizations: Array<{
    organizationKey: string;
    organizationId: string | null;
    organizationName: string;
    organizationSlug: string;
    cohort: DeveloperCohort;
    logoUrl: string | null;
    activePeople: number;
    activeMaintainers: number;
    activeLeads: number;
    activePeopleChange12m: number;
    joins12m: number;
    exits12m: number;
    netTeamChange12m: number;
    commitCount12m: number;
    mergeCount12m: number;
    series: Array<{ period: string; activePeople: number }>;
  }>;
  movements: Array<{
    sourceOrganizationKey: string;
    sourceOrganizationName: string;
    destinationOrganizationKey: string;
    destinationOrganizationName: string;
    people: number;
    maintainerMovements: number;
  }>;
};

export type DeveloperReportV2Point = PeopleOverview["points"][number] & {
  oneDayPeople: number;
  regularPeople: number;
  sustainedPeople: number;
  singleChainPeople: number;
  multiChainPeople: number;
  unmappedChainPeople: number;
  newcomerPeople: number;
  emergingPeople: number;
  establishedPeople: number;
};

export type DeveloperReportGrowth = {
  oneYear: number | null;
  twoYear: number | null;
  threeYear: number | null;
};

export type DeveloperReportV2 = {
  available: boolean;
  asOf: string | null;
  completeThrough: string | null;
  methodologyVersion: "developer-report-v2";
  scope: {
    type: "cohort" | "chain";
    key: string;
    label: string;
    slug: string | null;
    logoUrl: string | null;
    overlapping: boolean;
  };
  scopes: {
    cohorts: Array<{
      cohort: DeveloperCohort;
      label: string;
      activePeople: number;
      activeMaintainers: number;
      activeOrganizations: number;
    }>;
    chains: Array<{
      chainId: string;
      chainSlug: string;
      chainName: string;
      logoUrl: string | null;
      activePeople: number;
      activeMaintainers: number;
      activeLeads: number;
      establishedPeople: number;
      activeOrganizations: number;
      repositoryCount: number;
      growth: DeveloperReportGrowth;
    }>;
  };
  coverage: {
    githubOrganizations: number;
    chainMappedGithubOrganizations: number;
    chainMappedPercent: number;
    note: string;
  };
  population: DeveloperReport["population"];
  current: DeveloperReportV2Point | null;
  history: DeveloperReportV2Point[];
  totals: { repositoryCount: number; commitCount: number };
  repositoryHistory: Array<{ period: string; newRepositories: number }>;
  breakdown: Array<{
    key: "internalPeople" | "maintainers" | "leads" | "established";
    label: string;
    current: number;
    growth: DeveloperReportGrowth;
  }>;
  organizations: Array<{
    organizationKey: string;
    organizationId: string | null;
    organizationName: string;
    organizationSlug: string;
    cohort: DeveloperCohort;
    logoUrl: string | null;
    activePeople: number;
    activeMaintainers: number;
    activeLeads: number;
    establishedPeople: number;
    growth: DeveloperReportGrowth;
    joins12m: number;
    exits12m: number;
    netTeamChange12m: number;
    commitCount12m: number;
    mergeCount12m: number;
    series: Array<{ period: string; activePeople: number }>;
  }>;
  movements: DeveloperReport["movements"];
};

export type PeopleActivityMap = {
  available: boolean;
  asOf: string | null;
  metric: PeopleMetric;
  page: number;
  limit: number;
  total: number;
  rows: Array<{
    organizationKey: string;
    organizationId: string | null;
    organizationName: string;
    organizationSlug: string;
    logoUrl: string | null;
    githubOrganizations: string[];
    currentValue: number;
    change: number;
    totalValue: number;
    series: Array<{ period: string; value: number }>;
  }>;
};

export type PeopleAtlasFrame = {
  available: boolean;
  asOf: string | null;
  fromPeriod: string | null;
  toPeriod: string | null;
  focusOrganizationKey: string | null;
  totalMovements: number;
  visibleMovements: number;
  organizations: Array<{
    organizationKey: string;
    organizationId: string | null;
    organizationName: string;
    organizationSlug: string;
    logoUrl: string | null;
    githubOrganizations: string[];
    activePeople: number;
    activeMaintainers: number;
    series: Array<{
      period: string;
      activePeople: number;
      activeMaintainers: number;
    }>;
  }>;
  flows: Array<{
    period: string;
    sourceOrganizationKey: string;
    destinationOrganizationKey: string;
    people: number;
    maintainerMovements: number;
  }>;
};

export type PeopleDirectoryItem = {
  personId: string;
  login: string;
  displayName: string | null;
  avatarUrl: string | null;
  githubUrl: string | null;
  firstActivityAt: string;
  lastActivityAt: string;
  activityCount: number;
  commitCount: number;
  mergeCount: number;
  organizationCount: number;
  maintainerOrganizationCount: number;
  current: boolean;
  maintainer: boolean;
  activeLead: boolean;
  currentOrganizationKey: string;
  currentOrganizationId: string | null;
  currentOrganizationName: string;
  currentOrganizationSlug: string;
  currentOrganizationLogoUrl: string | null;
  concurrentOrganizationKeys: string[];
};

export type PeopleDirectoryPage = {
  available: boolean;
  asOf: string | null;
  count: number;
  nextCursor: string | null;
  data: PeopleDirectoryItem[];
};

export type PersonProfile = PeopleDirectoryItem & {
  episodes: Array<{
    organizationKey: string;
    organizationId: string | null;
    organizationName: string;
    organizationSlug: string;
    logoUrl: string | null;
    episodeNumber: number;
    startedAt: string;
    lastActivityAt: string;
    exitedAt: string;
    activityCount: number;
    commitCount: number;
    mergeCount: number;
    maintainer: boolean;
    current: boolean;
    returned: boolean;
  }>;
  movements: Array<{
    sourceOrganizationKey: string;
    sourceOrganizationName: string;
    sourceOrganizationSlug: string;
    destinationOrganizationKey: string;
    destinationOrganizationName: string;
    destinationOrganizationSlug: string;
    sourceLastActivityAt: string;
    destinationFirstActivityAt: string;
    confirmedAt: string;
    involvesMaintainer: boolean;
    status: "active" | "observed";
  }>;
  activity: Array<{
    period: string;
    organizationKey: string;
    organizationName: string;
    activityCount: number;
    commitCount: number;
    mergeCount: number;
    maintainer: boolean;
    activeLead: boolean;
  }>;
  maintainerSupport: Array<{
    organizationKey: string;
    organizationId: string | null;
    organizationName: string;
    organizationSlug: string;
    mergedPrCount: number;
    internalAuthorsSupported: number;
    currentInternalAuthorsSupported: number;
    firstSupportedMergeAt: string;
    lastSupportedMergeAt: string;
    internalAuthorLogins: string[];
  }>;
};
