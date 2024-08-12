export interface CandidateReportUser {
  wallet: string;
  avatar: string;
  github: string; // github username
  cryptoNative: boolean;
  averageTenure: number;
  stars: number;
  tags: string[];
}

export interface Nft {
  name: string;
  previewUrl: string | null;
  timestamp: number | null;
}

export interface CandidateReportRepository {
  name: string; // maybe unslugified repo-name e.g. github.com/jobstash/job-frame -> "Job Frame"
  url: string; // e.g. https://github.com/some-user/repo-name or gitlab etc
  tenure: number;
  stars: number;
  commitCount: number;
  timeFirstCommit: number;
  timeLastCommit: number;
  skills: string[];
}

export interface CandidateReportAdjacentRepo {
  name: string;
  stars: number;
}

export interface CandidateReportOrganization {
  name: string;
  avatar: string;
  tenure: number;
  commits: number;
  url: string;
  github: string; // github org username
  repositories: CandidateReportRepository[];
}

export interface TopOrgItem {
  name: string;
  github: string;
  avatar: string;
  tenure: number;
  commits: number;
}

export interface CandidateReport {
  user: CandidateReportUser;
  topOrganizations: TopOrgItem[];
  nfts: Nft[];
  orgs: CandidateReportOrganization[];
  adjacentRepos: CandidateReportAdjacentRepo[];
}
