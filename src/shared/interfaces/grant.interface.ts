import { ApiProperty } from "@nestjs/swagger";
import { ApplicationStatus } from "src/grants/generated";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { FundingEvent } from "./funding-event.interface";

export class RawGrantProjectCodeMetrics {
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

export class RawGrantProjectOnchainMetrics {
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
  days_since_first_transaction: string;

  @ApiProperty()
  active_contract_count_90_days: string;

  @ApiProperty()
  transaction_count: string;

  @ApiProperty()
  transaction_count_6_months: string;

  @ApiProperty()
  gas_fees_sum: string;

  @ApiProperty()
  gas_fees_sum_6_months: string;

  @ApiProperty()
  address_count: string;

  @ApiProperty()
  address_count_90_days: string;

  @ApiProperty()
  new_address_count_90_days: string;

  @ApiProperty()
  returning_address_count_90_days: string;

  @ApiProperty()
  high_activity_address_count_90_days: string;

  @ApiProperty()
  medium_activity_address_count_90_days: string;

  @ApiProperty()
  low_activity_address_count_90_days: string;

  @ApiProperty()
  multi_project_address_count_90_days: string;
}

export class RawGrantProjectContractMetrics {
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
  description: string;

  @ApiProperty()
  websites: {
    url: string;
  };

  @ApiProperty()
  social: {
    farcaster: {
      url: string;
    };
    twitter: {
      url: string;
    };
  };

  @ApiProperty()
  github: {
    url: string;
  }[];

  @ApiProperty()
  npm: {
    url: string;
  }[];

  @ApiProperty()
  blockchain: {
    address: string;
    name: string;
    networks: string[];
    tags: string[];
  }[];

  @ApiProperty()
  sha: string;

  @ApiProperty()
  committed_time: string;
}

interface StatItem {
  label: string;
  value: string;
  stats: StatItem[];
}

export class GrantProject {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  tags: string[];

  @ApiProperty()
  tabs: { label: string; tab: string; stats: StatItem[] }[];

  public static readonly GrantProjectType = new t.Type<
    GrantProject,
    GrantProject,
    unknown
  >(
    "grant-project",
    (input: unknown): input is GrantProject => typeof input === "object",
    // `t.success` and `t.failure` are helpers used to build `Either` instances
    (input: GrantProject, context) =>
      typeof input === "object" ? t.success(input) : t.failure(input, context),
    // `A` and `O` are the same, so `encode` is just the identity function
    t.identity,
  );
}

export class Grantee {
  public static readonly GranteeType = t.strict({
    id: t.string,
    name: t.string,
    slug: t.string,
    logoUrl: t.union([t.string, t.null]),
    fundingEvents: t.array(FundingEvent.FundingEventType),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  logoUrl: string | null;

  @ApiProperty()
  fundingEvents: FundingEvent[];

  constructor(raw: Grantee) {
    const { id, name, slug, logoUrl, fundingEvents } = raw;
    const result = Grantee.GranteeType.decode(raw);

    this.id = id;
    this.name = name;
    this.slug = slug;
    this.logoUrl = logoUrl;
    this.fundingEvents = fundingEvents;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `grantee instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export class GranteeDetails extends Grantee {
  public static readonly GranteeDetailsType = t.intersection([
    Grantee.GranteeType,
    t.strict({
      projects: t.array(GrantProject.GrantProjectType),
      status: t.keyof({
        PENDING: "PENDING" as const,
        APPROVED: "APPROVED" as const,
        REJECTED: "REJECTED" as const,
        CANCELLED: "CANCELLED" as const,
        IN_REVIEW: "IN_REVIEW" as const,
      }),
      description: t.string,
      website: t.union([t.string, t.null]),
    }),
  ]);

  @ApiProperty()
  projects: GrantProject[];

  @ApiProperty()
  website: string | null;

  @ApiProperty()
  status: ApplicationStatus;

  @ApiProperty()
  description: string;

  constructor(raw: GranteeDetails) {
    const { status, description, website, projects } = raw;
    super(raw);
    const result = GranteeDetails.GranteeDetailsType.decode(raw);

    this.projects = projects;
    this.status = status;
    this.description = description;
    this.website = website;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `grantee details instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
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
  slug: string;
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
  twitter: string | null;
  website: string | null;
  discord: string | null;
  orgWebsite: string | null;
  blog: string | null;
  forum: string | null;
  grantsSite: string | null;
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
    slug: t.string,
    status: t.string,
    socialLinks: t.union([
      t.strict({
        twitter: t.union([t.string, t.null]),
        website: t.union([t.string, t.null]),
        discord: t.union([t.string, t.null]),
        orgWebsite: t.union([t.string, t.null]),
        blog: t.union([t.string, t.null]),
        forum: t.union([t.string, t.null]),
        grantsSite: t.union([t.string, t.null]),
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
  slug: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  socialLinks: SocialLinks | null;

  @ApiProperty()
  eligibility: KarmaGapEligibility | null;

  @ApiProperty()
  metadata: KarmaGapGrantProgramMetadata;

  constructor(raw: GrantListResult) {
    const { id, name, slug, status, socialLinks, eligibility, metadata } = raw;
    const result = GrantListResult.GrantListResultType.decode(raw);

    this.id = id;
    this.name = name;
    this.slug = slug;
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

export class GrantFunding {
  public static readonly GrantFundingType = t.strict({
    id: t.string,
    tokenAmount: t.number,
    tokenUnit: t.string,
    fundingDate: t.number,
    amount: t.number,
    programName: t.string,
    createdTimestamp: t.number,
    updatedTimestamp: t.union([t.number, t.null]),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  tokenAmount: number;

  @ApiProperty()
  tokenUnit: string;

  @ApiProperty()
  fundingDate: number;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  programName: string;

  @ApiProperty()
  createdTimestamp: number;

  @ApiProperty()
  updatedTimestamp: number | null;

  constructor(raw: GrantFunding) {
    const {
      id,
      tokenAmount,
      tokenUnit,
      fundingDate,
      programName,
      amount,
      createdTimestamp,
      updatedTimestamp,
    } = raw;
    const result = GrantFunding.GrantFundingType.decode(raw);

    this.id = id;
    this.tokenAmount = tokenAmount;
    this.tokenUnit = tokenUnit;
    this.fundingDate = fundingDate;
    this.amount = amount;
    this.programName = programName;
    this.createdTimestamp = createdTimestamp;
    this.updatedTimestamp = updatedTimestamp;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `grant funding instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export const grantFundingToFundingEvent = (x: GrantFunding): FundingEvent => {
  return {
    id: x.id,
    timestamp: new Date(x.fundingDate).getTime(),
    amountInUsd: x.amount,
    tokenAmount: x.tokenAmount,
    tokenUnit: x.tokenUnit,
    roundName: x.programName,
    sourceLink: null,
    eventType: "grant",
  };
};
