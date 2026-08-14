export type PeopleBucket = "month" | "quarter" | "year";
export type DeveloperReportRange = "3m" | "6m" | "1y" | "3y" | "max";
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

export type DeveloperReportPoint = {
  period: string;
  allContributors: number;
  activeDevelopers: number;
  internalDevelopers: number;
  canonicalInternalPeople: number;
  activeMaintainers: number;
  activeLeads: number;
  activeOrganizations: number;
  activeRepositories: number;
  rawIndexedCommitRecords: number;
  commitsWritten: number;
  creditedOriginalCommits: number;
  inheritedForkCommits: number;
  inheritedUnattributedCopyCommits: number;
  fullTimeDevelopers: number;
  partTimeDevelopers: number;
  oneTimeDevelopers: number;
  newcomerDevelopers: number;
  emergingDevelopers: number;
  establishedDevelopers: number;
  newDevelopers: number;
  newRepositories: number;
  newForkRepositories: number;
  newUnattributedCopyRepositories: number;
  internalDeveloperShare: number;
};

export type DeveloperReportScopeSummary = {
  slug: string;
  label: string;
  logoUrl: string | null;
  allContributors: number;
  activeDevelopers: number;
  internalDevelopers: number;
  activeMaintainers: number;
  activeLeads: number;
  activeOrganizations: number;
  activeRepositories: number;
};

export type DeveloperVerticalSummary = DeveloperReportScopeSummary & {
  exclusive: true;
  history: DeveloperReportPoint[];
};

export type DeveloperReport = {
  available: boolean;
  asOf: string | null;
  completeThrough: string | null;
  methodologyVersion: "developer-report-v2";
  range: {
    key: DeveloperReportRange;
    label: string;
    from: string;
    to: string;
  };
  summary: {
    allTimeIngestedCommitRows: number;
    reportCommitRecords: number;
    rawIndexedCommitRecords: number;
    commitsWritten: number;
    creditedOriginalCommits: number;
    inheritedForkCommits: number;
    inheritedUnattributedCopyCommits: number;
    allContributors: number;
    activeDevelopers: number;
    internalDevelopers: number;
    canonicalInternalPeople: number;
    maintainers: number;
    activeLeads: number;
    organizations: number;
    activeRepositories: number;
    newDevelopers: number;
    newRepositories: number;
    newForkRepositories: number;
    newUnattributedCopyRepositories: number;
    internalDeveloperShare: number;
  };
  scope: {
    type: "overall" | "vertical" | "chain" | "vertical_chain";
    label: string;
    vertical: string | null;
    chain: string | null;
    logoUrl: string | null;
    verticalsAreExclusive: true;
    chainsOverlap: boolean;
  };
  scopes: {
    verticals: DeveloperVerticalSummary[];
    chains: DeveloperReportScopeSummary[];
  };
  coverage: {
    organizationsTotal: number;
    categorizedOrganizations: number;
    unclassifiedOrganizations: number;
    organizationPercent: number;
    developersTotal: number;
    categorizedDevelopers: number;
    unclassifiedDevelopers: number;
    developerPercent: number;
    note: string;
  };
  population: {
    label: string;
    definition: string;
    excludes: string[];
  };
  current: DeveloperReportPoint | null;
  history: DeveloperReportPoint[];
  top: {
    verticals: DeveloperReportScopeSummary[];
    chains: DeveloperReportScopeSummary[];
    organizations: Array<{
      organizationKey: string;
      organizationName: string;
      activeDevelopers: number;
    }>;
  };
  organizations: Array<{
    organizationKey: string;
    organizationId: string | null;
    organizationName: string;
    organizationSlug: string;
    vertical: string;
    logoUrl: string | null;
    layoutX: number | null;
    layoutY: number | null;
    communityId: number | null;
    allContributors: number;
    activeDevelopers: number;
    internalDevelopers: number;
    canonicalInternalPeople: number;
    maintainers: number;
    leads: number;
    creditedOriginalCommits: number;
    activeRepositories: number;
    series: Array<{
      period: string;
      activeDevelopers: number;
      internalDevelopers: number;
      activeMaintainers: number;
      activeLeads: number;
    }>;
  }>;
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
