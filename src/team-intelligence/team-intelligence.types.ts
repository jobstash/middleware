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
  newMaintainerCount: number | null;
  movedMaintainerCount: number | null;
  earlyMovedMaintainerCount: number | null;
  growingTeam: boolean | null;
  shrinkingTeam: boolean | null;
  earlyTeamShrinkage: boolean | null;
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
  growingTeam?: boolean;
  shrinkingTeam?: boolean;
  earlyTeamShrinkage?: boolean;
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
  growingTeam?: boolean | null;
  shrinkingTeam?: boolean | null;
  earlyTeamShrinkage?: boolean | null;
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
    firstWriteAt: string;
    qualifiedAt: string;
    lastWriteAt: string;
    writeOperations: number;
    current: boolean;
    earlyCohort: boolean;
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
    sourceLastWriteAt: string;
    destinationFirstWriteAt: string;
    confirmedAt: string;
    earlyMaintainer: boolean;
    earlyCohort: boolean;
    status: "active" | "observed";
    returnedAt: null;
  }>;
};

export type TeamOrganizationFields = {
  orgId?: string | null;
  teamCoverageStatus?: TeamCoverageStatus | null;
  teamSignalsAsOf?: string | null;
  currentMaintainerCount?: number | null;
  activeLeadCount?: number | null;
  newActiveLeadCount?: number | null;
  steppedDownLeadCount?: number | null;
  movedLeadCount?: number | null;
  earlyLeadDepartureCount?: number | null;
  growingTeam?: boolean | null;
  shrinkingTeam?: boolean | null;
  earlyTeamShrinkage?: boolean | null;
};
