export type TeamCoverageStatus = "current" | "unknown";

export type OrganizationTeamSummary = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  githubOrganizations: string[];
  coverageStatus: TeamCoverageStatus;
  asOf: string;
  currentMaintainerCount: number | null;
  activeLeadCount: number | null;
  newActiveLeadCount: number | null;
  steppedDownLeadCount: number | null;
  movedLeadCount: number | null;
  earlyLeadDepartureCount: number | null;
  latestThreeMonthAverageActiveDevelopers: number | null;
  priorThreeMonthAverageActiveDevelopers: number | null;
  developerGrowth: boolean;
  growthReasons: Array<"developer_growth">;
};

export type TeamSnapshot = {
  snapshotVersion: 2;
  available: boolean;
  asOf: string | null;
  organizations: OrganizationTeamSummary[];
};

export type TeamSnapshotInput = {
  organizationIds?: string[];
  newActiveLeads?: boolean;
  steppedDownLeads?: boolean;
  movedLeads?: boolean;
  earlyLeadDepartures?: boolean;
  activeLeadsMin?: number;
  activeLeadsMax?: number;
  currentMaintainersMin?: number;
  currentMaintainersMax?: number;
};

export type TeamFilterInput = {
  minCurrentMaintainers?: number | null;
  maxCurrentMaintainers?: number | null;
  minActiveLeads?: number | null;
  maxActiveLeads?: number | null;
  newActiveLeads?: boolean | null;
  steppedDownLeads?: boolean | null;
  movedLeads?: boolean | null;
  earlyLeadDepartures?: boolean | null;
};

export type TeamPage<T> = {
  page: number;
  count: number;
  total: number;
  data: T[];
};

export type OrganizationTeamDetail = OrganizationTeamSummary & {
  maintainers: TeamPage<{
    githubUserId: string;
    login: string;
    firstMergeAt: string;
    lastMergeAt: string;
    mergeCount: number;
    mergedPrCount: number;
    internalAuthorsSupported: number;
    currentInternalAuthorsSupported: number;
    supportedAuthorLogins: string[];
    currentEmployee: boolean;
    currentMaintainer: boolean;
    activeLead: boolean;
    earlyMaintainer: boolean;
  }>;
  movements: TeamPage<{
    githubUserId: string;
    login: string;
    sourceOrganizationId: string;
    destinationOrganizationId: string;
    destinationOrganizationName: string;
    destinationOrganizationSlug: string;
    sourceLastMergeAt: string;
    destinationFirstMergeAt: string;
    confirmedAt: string;
    earlyMaintainer: boolean;
    status: "active" | "observed";
    returnedAt: null;
  }>;
};

export type TeamOrganizationFields = {
  orgId?: string | null;
  recentlyFunded?: boolean;
  teamCoverageStatus?: TeamCoverageStatus | null;
  teamSignalsAsOf?: string | null;
  currentMaintainerCount?: number | null;
  activeLeadCount?: number | null;
  newActiveLeadCount?: number | null;
  steppedDownLeadCount?: number | null;
  movedLeadCount?: number | null;
  earlyLeadDepartureCount?: number | null;
  latestThreeMonthAverageActiveDevelopers?: number | null;
  priorThreeMonthAverageActiveDevelopers?: number | null;
  developerGrowth?: boolean;
  growingCompanyReasons?: Array<"developer_growth" | "recently_funded">;
};
