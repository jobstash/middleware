import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class CreateOrganizationInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  orgId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  logoUrl: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  summary: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  headcountEstimate: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  altName?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  aliases?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  website?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  twitter?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  github?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discord?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  docs?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telegram?: string[];
}
