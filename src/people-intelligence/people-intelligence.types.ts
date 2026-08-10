export type PeopleBucket = "month" | "quarter" | "year";
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
  period: string | null;
  comparePeriod: string | null;
  nodes: Array<{
    organizationKey: string;
    organizationId: string | null;
    organizationName: string;
    organizationSlug: string;
    logoUrl: string | null;
    githubOrganizations: string[];
    x: number;
    y: number;
    communityId: number;
    activePeople: number;
    activeMaintainers: number;
    activeLeads: number;
    joins: number;
    exits: number;
    change: number;
  }>;
  edges: Array<{
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
