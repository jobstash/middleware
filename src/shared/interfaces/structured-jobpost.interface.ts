import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class StructuredJobpost {
  @ApiProperty()
  id: string;

  @ApiProperty()
  shortUUID: string;

  @ApiProperty()
  minSalaryRange: number | null;

  @ApiProperty()
  maxSalaryRange: number | null;

  @ApiProperty()
  medianSalary: number | null;

  @ApiProperty()
  role: string | null;

  @ApiProperty()
  seniority: string | null;

  @ApiProperty()
  team: string | null;

  @ApiProperty()
  benefits: string | null;

  @ApiProperty()
  culture: string | null;

  @ApiProperty()
  salaryCurrency: string | null;

  @ApiProperty()
  paysInCrypto: boolean | null;

  @ApiProperty()
  offersTokenAllocation: boolean | null;

  @ApiProperty()
  jobApplyPageUrl: string;

  @ApiPropertyOptional()
  jobCommitment: string | null;

  @ApiProperty()
  jobCreatedTimestamp: number;

  @ApiProperty()
  jobFoundTimestamp: number;

  @ApiProperty()
  jobPageUrl: string | null;

  @ApiProperty()
  jobLocation: string | null;

  @ApiProperty()
  jobTitle: string | null;

  @ApiProperty()
  aiDetectedTechnologies: string | null;

  @ApiProperty()
  extractedTimestamp: string;
}
