import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class StructuredJobpost {
  @ApiProperty()
  id: string;
  @ApiProperty()
  minSalary: number;
  @ApiProperty()
  maxSalary: number;
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
  hardSkills: string[];
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
  extractedTimestamp: string;
}
