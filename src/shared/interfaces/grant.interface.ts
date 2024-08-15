import { ApiProperty } from "@nestjs/swagger";
import { ApplicationStatus } from "src/grants/generated";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export interface GranteeApplicationMetadata {
  signature: string;
  application: Application;
}

export interface Application {
  round: string;
  answers: Answer[];
  project: Project2;
  recipient: string;
}

export interface Answer {
  type: string;
  hidden: boolean;
  question: string;
  questionId: number;
  encryptedAnswer?: EncryptedAnswer;
  answer: string;
}

export interface EncryptedAnswer {
  ciphertext: string;
  encryptedSymmetricKey: string;
}

export interface Project2 {
  id: string;
  title: string;
  logoImg: string;
  metaPtr: MetaPtr;
  website: string;
  bannerImg: string;
  createdAt: number;
  userGithub: string;
  credentials: Credentials;
  description: string;
  lastUpdated: number;
  projectGithub: string;
  projectTwitter: string;
}

export interface MetaPtr {
  pointer: string;
  protocol: string;
}

export interface Credentials {
  github: GithubCredentials;
  twitter: TwitterCredentials;
}

export interface GithubCredentials {
  type: string[];
  proof: Proof;
  issuer: string;
  "@context": string[];
  issuanceDate: string;
  expirationDate: string;
  credentialSubject: CredentialSubject;
}

export interface Proof {
  jws: string;
  type: string;
  created: string;
  proofPurpose: string;
  verificationMethod: string;
}

export interface CredentialSubject {
  id: string;
  hash: string;
  "@context": Context[];
  provider: string;
}

export interface Context {
  hash: string;
  provider: string;
}

export interface TwitterCredentials {
  type: string[];
  proof: Proof2;
  issuer: string;
  "@context": string[];
  issuanceDate: string;
  expirationDate: string;
  credentialSubject: CredentialSubject2;
}

export interface Proof2 {
  jws: string;
  type: string;
  created: string;
  proofPurpose: string;
  verificationMethod: string;
}

export interface CredentialSubject2 {
  id: string;
  hash: string;
  "@context": Context2[];
  provider: string;
}

export interface Context2 {
  hash: string;
  provider: string;
}

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
  public static readonly GranteeType = t.strict({
    id: t.string,
    tags: t.array(t.string),
    status: t.keyof({
      PENDING: "PENDING" as const,
      APPROVED: "APPROVED" as const,
      REJECTED: "REJECTED" as const,
      CANCELLED: "CANCELLED" as const,
      IN_REVIEW: "IN_REVIEW" as const,
    }),
    description: t.string,
    name: t.string,
    website: t.union([t.string, t.null]),
    logoUrl: t.union([t.string, t.null]),
    projects: t.array(
      t.strict({
        id: t.string,
        name: t.string,
      }),
    ),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  tags: string[];

  @ApiProperty()
  status: ApplicationStatus;

  @ApiProperty()
  description: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  website: string | null;

  @ApiProperty()
  logoUrl: string | null;

  @ApiProperty()
  projects: {
    id: string;
    name: string;
  }[];

  constructor(raw: Grantee) {
    const { id, tags, status, description, name, website, logoUrl, projects } =
      raw;
    const result = Grantee.GranteeType.decode(raw);

    this.id = id;
    this.tags = tags;
    this.status = status;
    this.description = description;
    this.name = name;
    this.website = website;
    this.logoUrl = logoUrl;
    this.projects = projects;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `grantee instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
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
  description: string | null;
  programBudget: number | null;
  amountDistributedToDate: number | null;
  minGrantSize: number | null;
  maxGrantSize: number | null;
  grantsToDate: number | null;
  website: string | null;
  projectTwitter: string | null;
  bugBounty: string | null;
  categories: string[];
  ecosystems: string[];
  organizations: string[];
  networks: string[];
  grantTypes: string[];
  platformsUsed: string[];
  logoImg: string | null;
  bannerImg: string | null;
  createdAt: number | null;
  type: string | null;
  tags: string[];
  amount: string | null;
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
  public static readonly GrantListResultType = t.strict({
    id: t.string,
    name: t.string,
    status: t.string,
    socialLinks: t.union([
      t.strict({
        twitter: t.string,
        website: t.string,
        discord: t.string,
        orgWebsite: t.string,
        blog: t.string,
        forum: t.string,
        grantsSite: t.string,
      }),
      t.null,
    ]),
    eligibility: t.union([
      t.strict({
        programId: t.string,
        description: t.string,
        requirements: t.array(t.string),
      }),
      t.null,
    ]),
    metadata: t.strict({
      title: t.string,
      description: t.union([t.string, t.null]),
      programBudget: t.union([t.number, t.null]),
      amountDistributedToDate: t.union([t.number, t.null]),
      minGrantSize: t.union([t.number, t.null]),
      maxGrantSize: t.union([t.number, t.null]),
      grantsToDate: t.union([t.number, t.null]),
      website: t.union([t.string, t.null]),
      projectTwitter: t.union([t.string, t.null]),
      bugBounty: t.union([t.string, t.null]),
      categories: t.array(t.string),
      ecosystems: t.array(t.string),
      organizations: t.array(t.string),
      networks: t.array(t.string),
      grantTypes: t.array(t.string),
      platformsUsed: t.array(t.string),
      logoImg: t.union([t.string, t.null]),
      bannerImg: t.union([t.string, t.null]),
      createdAt: t.union([t.number, t.null]),
      type: t.union([t.string, t.null]),
      tags: t.array(t.string),
      amount: t.union([t.string, t.null]),
    }),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  socialLinks: SocialLinks | null;

  @ApiProperty()
  eligibility: KarmaGapEligibility | null;

  @ApiProperty()
  metadata: KarmaGapGrantProgramMetadata;

  constructor(raw: GrantListResult) {
    const { id, name, status, socialLinks, eligibility, metadata } = raw;
    const result = GrantListResult.GrantListResultType.decode(raw);

    this.id = id;
    this.name = name;
    this.status = status;
    this.socialLinks = socialLinks;
    this.eligibility = eligibility;
    this.metadata = metadata;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `grant list result instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
