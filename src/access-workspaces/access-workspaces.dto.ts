import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import { KnownBountyTotal } from "./bounty-amounts";

export const ACCESS_WORKSPACE_MEMBER_ROLES = [
  "admin",
  "analyst",
  "viewer",
] as const;

export class AgencyBountySummary {
  @ApiProperty()
  openJobCount: number;

  @ApiProperty()
  companyCount: number;

  @ApiProperty()
  disclosedAmountCount: number;

  @ApiProperty({ type: () => [AgencyKnownBountyTotal] })
  knownTotals: AgencyKnownBountyTotal[];
}

export class AgencyKnownBountyTotal implements KnownBountyTotal {
  @ApiProperty()
  currency: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  jobCount: number;
}

export class AgencyBountyCompany {
  @ApiProperty()
  id: string;

  @ApiProperty()
  type: "organization" | "project";

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  slug: string | null;

  @ApiProperty({ nullable: true })
  logoUrl: string | null;

  @ApiProperty()
  openBountyJobCount: number;

  @ApiProperty({ type: () => [AgencyKnownBountyTotal] })
  knownTotals: AgencyKnownBountyTotal[];

  @ApiProperty({ nullable: true })
  latestPublishedTimestamp: number | null;
}

export class AgencyBountyJob {
  @ApiProperty()
  shortUUID: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ nullable: true })
  summary: string | null;

  @ApiProperty({ nullable: true })
  url: string | null;

  @ApiProperty({ nullable: true })
  location: string | null;

  @ApiProperty({ nullable: true })
  classification: string | null;

  @ApiProperty({ nullable: true })
  publishedTimestamp: number | null;

  @ApiProperty({ nullable: true })
  bountyAmount: string | null;

  @ApiProperty({ enum: ["job_posting", "career_page"] })
  bountySource: "job_posting" | "career_page";

  @ApiProperty()
  companyId: string;

  @ApiProperty()
  companyType: "organization" | "project";

  @ApiProperty()
  companyName: string;

  @ApiProperty({ nullable: true })
  companySlug: string | null;

  @ApiProperty({ nullable: true })
  companyLogoUrl: string | null;
}

export class AgencyBountyOpportunities {
  @ApiProperty({ type: () => AgencyBountySummary })
  summary: AgencyBountySummary;

  @ApiProperty({ type: [AgencyBountyCompany] })
  companies: AgencyBountyCompany[];

  @ApiProperty({ type: [AgencyBountyJob] })
  jobs: AgencyBountyJob[];
}

export class CreateAccessWorkspaceInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  primaryProfileId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  domain: string;
}

export class PutAccessWorkspaceMemberInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ enum: ACCESS_WORKSPACE_MEMBER_ROLES })
  @IsIn(ACCESS_WORKSPACE_MEMBER_ROLES)
  role: (typeof ACCESS_WORKSPACE_MEMBER_ROLES)[number];
}

export class InspectProfileInput {
  @ApiProperty()
  @IsUUID()
  workspaceId: string;
}

export class RevealInspectProfileInput extends InspectProfileInput {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  fields: string[];
}

export class TransferAccessWorkspaceDomainInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  domain: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  reason: string;

  @ApiProperty({
    description:
      "Explicitly authorizes transfer away from an active source workspace.",
  })
  @IsBoolean()
  superadminBypass: boolean;
}
