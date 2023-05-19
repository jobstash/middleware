import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class StructuredJobpost {
  @ApiProperty()
  id: string;

  @ApiProperty()
  shortUUID: string;

  @ApiProperty()
  minSalaryRange?: number;

  @ApiProperty()
  maxSalaryRange?: number;

  @ApiProperty()
  medianSalary: number;

  @ApiProperty()
  role: null | string;

  @ApiProperty()
  seniority: string;

  @ApiProperty()
  team: null | string;

  @ApiProperty()
  benefits: null | string;

  @ApiProperty()
  culture: null | string;

  @ApiProperty()
  salaryCurrency?: string;

  @ApiProperty()
  paysInCrypto?: boolean;

  @ApiProperty()
  offersTokenAllocation?: boolean;

  @ApiProperty()
  jobApplyPageUrl: string;

  @ApiPropertyOptional()
  jobCommitment: null | string;

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
