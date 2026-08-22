import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

class SimilarJobOrganization {
  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  logoUrl: string | null;

  @ApiPropertyOptional()
  normalizedName: string | null;

  @ApiPropertyOptional()
  website: string | null;
}

class SimilarJobProject {
  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  logo: string | null;

  @ApiPropertyOptional()
  normalizedName: string | null;

  @ApiPropertyOptional()
  website: string | null;
}

export class SimilarJob {
  @ApiProperty()
  shortUUID: string;

  @ApiPropertyOptional()
  title: string | null;

  @ApiPropertyOptional()
  timestamp: number | null;

  @ApiProperty({ type: SimilarJobOrganization, nullable: true })
  organization: SimilarJobOrganization | null;

  @ApiProperty({ type: SimilarJobProject, nullable: true })
  project: SimilarJobProject | null;
}
