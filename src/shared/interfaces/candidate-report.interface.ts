import { AdjacentRepo } from "./user/user-repo.interface";

export interface CandidateReportUser {
  wallet: string | null;
  avatar: string | null;
  github: string;
  cryptoNative: boolean;
  averageTenure: number | null;
  stars: number | null;
  tags: string[];
}

export interface CandidateReportRepository {
  name: string;
  url: string;
  description: string | null;
  cryptoNative: boolean;
  tenure: number;
  stars: number;
  commitCount: number;
  timeFirstCommit: number;
  timeLastCommit: number;
  skills: string[];
}

export interface CandidateReportOrganization {
  name: string | null;
  avatar: string;
  description: string | null;
  firstContributedAt: number;
  lastContributedAt: number;
  tenure: number;
  commits: number;
  url: string | null;
  github: string;
  cryptoNative: boolean;
  repositories: CandidateReportRepository[];
}

export interface CandidateReportTopOrganization {
  name: string | null;
  github: string;
  avatar: string;
  tenure: number;
  commits: number;
  cryptoNative: boolean;
}

export interface CandidateThreatAttribution {
  knownActor: boolean;
  actorId: string | null;
  relationship: string | null;
  displayName: string | null;
  aliases: string[];
  realCitizenships: string[];
  confidence: number | null;
}

export interface CandidateDeveloperEpisode {
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
}

export interface CandidateDeveloperMovement {
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
}

export interface CandidateDeveloperActivity {
  period: string;
  organizationKey: string;
  organizationName: string;
  activityCount: number;
  commitCount: number;
  mergeCount: number;
  maintainer: boolean;
  activeLead: boolean;
}

export interface CandidateMaintainerSupport {
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
}

export interface CandidateDeveloperIntelligence {
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
  episodes: CandidateDeveloperEpisode[];
  movements: CandidateDeveloperMovement[];
  activity: CandidateDeveloperActivity[];
  maintainerSupport: CandidateMaintainerSupport[];
}

export interface CandidateReport {
  user: CandidateReportUser;
  topOrganizations: CandidateReportTopOrganization[];
  nfts: {
    name: string;
    previewUrl: string | null;
    timestamp: number | null;
  }[];
  orgs: CandidateReportOrganization[];
  adjacentRepos: AdjacentRepo[];
  threat: CandidateThreatAttribution;
  developer: CandidateDeveloperIntelligence | null;
}
