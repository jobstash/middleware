import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from "@nestjs/swagger";
import { Technology } from "./technology.interface";
import {
  FundingRound,
  FundingRoundProperties,
} from "./funding-round.interface";
import { Project } from "./project.interface";

export class OrganizationProperties {
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

  @ApiProperty()
  jobsiteLink: string;
  @ApiProperty()
  docs?: string;
  @ApiProperty()
  altName: string;
  @ApiProperty()
  headCount: number;

  @ApiPropertyOptional()
  github: string;
  @ApiPropertyOptional()
  teamSize: null | number;
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

@ApiExtraModels(Project, FundingRound)
export class Organization extends OrganizationProperties {
  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(Project) },
  })
  projects?: Project[];
  @ApiPropertyOptional({
    type: "array",
    items: { $ref: getSchemaPath(FundingRound) },
  })
  fundingRounds: FundingRound[];
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
  @ApiProperty({
    type: "array",
    items: { $ref: getSchemaPath(FundingRoundProperties) },
  })
  fundingRounds: FundingRoundProperties[];
  @ApiProperty({ type: "array", items: { $ref: getSchemaPath(Technology) } })
  technologies: Technology[];
}
