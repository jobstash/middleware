import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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
