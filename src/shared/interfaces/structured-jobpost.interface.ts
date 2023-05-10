import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class StructuredJobpost {
  @ApiProperty()
  id: string;

  @ApiProperty()
  shortUUID: string;

  @ApiProperty()
  minSalaryRange: number;

  @ApiProperty()
  maxSalaryRange: number;

  @ApiProperty()
  role: string;

  @ApiProperty()
  seniority: string;

  @ApiProperty()
  team: string;

  @ApiProperty()
  benefits: string;

  @ApiProperty()
  culture: string;

  @ApiProperty()
  salaryCurrency: string;

  @ApiProperty()
  paysInCrypto: boolean;

  @ApiProperty()
  offersTokenAllocation: boolean;

  @ApiProperty()
  jobApplyPageUrl: string;

  @ApiPropertyOptional()
  jobCommitment?: string;

  @ApiProperty()
  jobCreatedTimestamp: string;

  @ApiProperty()
  jobFoundTimestamp: string;

  @ApiProperty()
  jobPageUrl: string;

  @ApiProperty()
  jobLocation: string;

  @ApiProperty()
  jobTitle: string;

  @ApiProperty()
  aiDetectedTechnologies: string;

  @ApiProperty()
  extractedTimestamp: string;
}