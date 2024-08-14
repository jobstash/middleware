import { ApiProperty } from "@nestjs/swagger";
import { ApplicationStatus } from "src/grants/generated";

export class RawGrantProjectMetrics {
  @ApiProperty()
  project_id: string;

  @ApiProperty()
  project_source: string;

  @ApiProperty()
  project_namespace: string;

  @ApiProperty()
  project_name: string;

  @ApiProperty()
  display_name: string;

  @ApiProperty()
  event_source: string;

  @ApiProperty()
  repository_count: number;

  @ApiProperty()
  first_commit_date: {
    value: string;
  };

  @ApiProperty()
  last_commit_date: {
    value: string;
  };

  @ApiProperty()
  star_count: number;

  @ApiProperty()
  fork_count: number;

  @ApiProperty()
  contributor_count: number;

  @ApiProperty()
  contributor_count_6_months: number;

  @ApiProperty()
  new_contributor_count_6_months: number;

  @ApiProperty()
  fulltime_developer_average_6_months: number;

  @ApiProperty()
  active_developer_count_6_months: number;

  @ApiProperty()
  commit_count_6_months: number;

  @ApiProperty()
  opened_pull_request_count_6_months: number;

  @ApiProperty()
  merged_pull_request_count_6_months: number;

  @ApiProperty()
  opened_issue_count_6_months: number;

  @ApiProperty()
  closed_issue_count_6_months: number;
}

export class GrantProjectMetrics {
  @ApiProperty()
  projectId: string;

  @ApiProperty()
  projectSource: string;

  @ApiProperty()
  projectNamespace: string;

  @ApiProperty()
  projectName: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  eventSource: string;

  @ApiProperty()
  repositoryCount: number;

  @ApiProperty()
  firstCommitDate: number;

  @ApiProperty()
  lastCommitDate: number;

  @ApiProperty()
  starCount: number;

  @ApiProperty()
  forkCount: number;

  @ApiProperty()
  contributorCount: number;

  @ApiProperty()
  contributorCountSixMonths: number;

  @ApiProperty()
  newContributorCountSixMonths: number;

  @ApiProperty()
  fulltimeDeveloperAverageSixMonths: number;

  @ApiProperty()
  activeDeveloperCountSixMonths: number;

  @ApiProperty()
  commitCountSixMonths: number;

  @ApiProperty()
  openedPullRequestCountSixMonths: number;

  @ApiProperty()
  mergedPullRequestCountSixMonths: number;

  @ApiProperty()
  openedIssueCountSixMonths: number;

  @ApiProperty()
  closedIssueCountSixMonths: number;
}

interface StatItem {
  label: string;
  value: string;
  stats: StatItem[];
}

export class GrantProject {
  @ApiProperty()
  name: string;

  @ApiProperty()
  tags: string[];

  @ApiProperty()
  tabs: { label: string; stats: StatItem[] }[];
}

export class Grantee {
  @ApiProperty()
  tags: string[];

  @ApiProperty()
  status: ApplicationStatus;

  @ApiProperty()
  project: GrantProject;
}

export interface GrantMetadata {
  name: string;
  support: Support;
  roundType: string;
  eligibility: Eligibility;
  feesAddress: string;
  feesPercentage: number;
  programContractAddress: string;
  quadraticFundingConfig: QuadraticFundingConfig;
}

export interface Support {
  info: string;
  type: string;
}

export interface Eligibility {
  description: string;
  requirements: Requirement[];
}

export interface Requirement {
  requirement: string;
}

export interface QuadraticFundingConfig {
  matchingCap: boolean;
  sybilDefense: boolean;
  matchingCapAmount: number;
  minDonationThreshold: boolean;
  matchingFundsAvailable: number;
  minDonationThresholdAmount: number;
}

export class KarmaGapGrantProgram {
  programId: string;
  profileId: string;
  chainID: number;
  name: string;
  isValid: boolean;
  createdAtBlock: number;
  createdByAddress: string;
  status: string;
  socialLinks: SocialLinks;
  eligibility: KarmaGapEligibility;
  metadata: KarmaGapGrantProgramMetadata;
  quadraticFundingConfig: KarmaGapQuadraticFundingConfig;
  support: KarmaGapSupport;
  txHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface KarmaGapEligibility {
  programId: string;
  description: string;
  requirements: string[];
}

export interface KarmaGapQuadraticFundingConfig {
  programId: string;
  matchingCap: boolean;
  matchingFundsAvailable: number;
}

export interface KarmaGapSupport {
  programId: string;
  type: string;
  info: string;
}

export interface KarmaGapGrantProgramMetadata {
  title: string;
  description: string;
  programBudget: number;
  amountDistributedToDate: number;
  minGrantSize: number;
  maxGrantSize: number;
  grantsToDate: number;
  website: string;
  projectTwitter: string;
  bugBounty: string;
  categories: string[];
  ecosystems: string[];
  organizations: string[];
  networks: string[];
  grantTypes: string[];
  platformsUsed: string[];
  logoImg: string;
  bannerImg: string;
  createdAt: number;
  type: string;
  tags: string[];
  amount: string;
}

export interface SocialLinks {
  twitter: string;
  website: string;
  discord: string;
  orgWebsite: string;
  blog: string;
  forum: string;
  grantsSite: string;
}

export class Grant extends KarmaGapGrantProgram {
  @ApiProperty()
  tags: string[];

  @ApiProperty()
  grantees: Grantee[];
}

export class GrantListResult {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  socialLinks: SocialLinks;

  @ApiProperty()
  eligibility: KarmaGapEligibility;

  @ApiProperty()
  metadata: KarmaGapGrantProgramMetadata;
}
