import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from "class-validator";

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
  @IsArray()
  aliases?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  website?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  twitter?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  github?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  discord?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  docs?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  telegram?: string[];
}
