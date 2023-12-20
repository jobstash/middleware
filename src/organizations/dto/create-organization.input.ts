import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class CreateOrganizationInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  orgId: string;

  @ApiPropertyOptional()
  @IsNotEmpty()
  @IsUrl()
  logoUrl: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  alias?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  altName?: string;

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
  location: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsUrl()
  website: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  headcountEstimate: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  twitter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discord?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  docs?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telegram?: string;
}
