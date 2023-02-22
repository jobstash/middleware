import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class Organization {
  @ApiProperty()
  id: string;
  @ApiProperty()
  org_id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  description: string;
  @ApiProperty()
  location: string;
  @ApiProperty()
  url: string;

  @ApiProperty()
  github_organization: string;
  @ApiPropertyOptional()
  team_size?: string;
  @ApiPropertyOptional()
  twitter?: string;
  @ApiPropertyOptional()
  discord?: string;
  @ApiPropertyOptional()
  linkedin?: string;
  @ApiPropertyOptional()
  telegram?: string;
  @ApiProperty()
  created_timestamp: number;
  @ApiPropertyOptional()
  updated_timestamp?: number;
}
