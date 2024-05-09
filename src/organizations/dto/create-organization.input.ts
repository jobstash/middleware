import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
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
  logoUrl: string = null;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string = null;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  description: string = null;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  summary: string = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  headcountEstimate: number = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location: string = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  altName?: string = null;

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
