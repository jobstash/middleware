export type TeamCoverageStatus = "current" | "unknown";

export type OrganizationTeamSummary = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  githubOrganizations: string[];
  coverageStatus: TeamCoverageStatus;
  asOf: string;
  currentMaintainerCount: number | null;
  newMaintainerCount: number | null;
  movedMaintainerCount: number | null;
  earlyMovedMaintainerCount: number | null;
  growingTeam: boolean | null;
  shrinkingTeam: boolean | null;
  earlyTeamShrinkage: boolean | null;
};

export type TeamSnapshot = {
  snapshotVersion: 1;
  asOf: string | null;
  organizations: OrganizationTeamSummary[];
};

export type TeamSnapshotInput = {
  organizationIds?: string[];
  growingTeam?: boolean;
  shrinkingTeam?: boolean;
  earlyTeamShrinkage?: boolean;
  currentMaintainersMin?: number;
  currentMaintainersMax?: number;
};

export type TeamFilterInput = {
  minCurrentMaintainers?: number | null;
  maxCurrentMaintainers?: number | null;
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
    sourceLastWriteAt: string;
    destinationFirstWriteAt: string;
    confirmedAt: string;
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
  growingTeam?: boolean | null;
  shrinkingTeam?: boolean | null;
  earlyTeamShrinkage?: boolean | null;
};
