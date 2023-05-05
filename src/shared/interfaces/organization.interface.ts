import {
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { Technology } from "./technology.interface";
import { FundingRound } from "./funding-round.interface";

export class Organization {
  @ApiProperty()
  id: string;
  @ApiProperty()
  orgId: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  description: string;
  @ApiProperty()
  summary: string;
  @ApiProperty()
  location: string;
  @ApiProperty()
  url: string;

  @ApiPropertyOptional()
  githubOrganization?: string;
  @ApiPropertyOptional()
  teamSize?: string;
  @ApiPropertyOptional()
  twitter?: string;
  @ApiPropertyOptional()
  discord?: string;
  @ApiPropertyOptional()
  linkedin?: string;
  @ApiPropertyOptional()
  telegram?: string;
  @ApiPropertyOptional()
  createdTimestamp?: number;
  @ApiPropertyOptional()
  updatedTimestamp?: number;
}

export class ShortOrg {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiPropertyOptional()
  logo: string | null;
  @ApiProperty()
  location: string;
  @ApiProperty()
  jobCount: number;
  @ApiProperty()
  projectCount: number;
  @ApiProperty()
  headCount: number;
  @ApiProperty()
  lastFundingAmount: number;
  @ApiProperty()
  lastFundingDate: number;
  @ApiProperty()
  url: string;
  @ApiProperty()
  description: string;
  @ApiProperty()
  github: string;
  @ApiProperty()
  twitter: string;
  @ApiProperty()
  telegram: string;
  @ApiProperty()
  discord: string;
  @ApiProperty({ type: "array", items: { $ref: getSchemaPath(FundingRound) } })
  fundingRounds: FundingRound[];
  @ApiProperty({ type: "array", items: { $ref: getSchemaPath(Technology) } })
  technologies: Technology[];
}
