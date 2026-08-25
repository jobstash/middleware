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
}
