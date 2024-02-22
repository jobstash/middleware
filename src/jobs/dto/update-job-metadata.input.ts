import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from "class-validator";
import { Tag } from "src/shared/interfaces";

export class UpdateJobMetadataInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  url: string;

  @ApiProperty()
  @IsArray()
  benefits: string[];

  @ApiProperty()
  @IsArray()
  requirements: string[];

  @ApiProperty()
  @IsArray()
  responsibilities: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  title: string | null;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  @IsOptional()
  salary: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  culture: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seniority: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paysInCrypto: boolean | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  minimumSalary: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maximumSalary: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salaryCurrency: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  offersTokenAllocation: boolean | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commitment: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classification: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationType: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  project: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isBlocked: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOnline: boolean;

  @ApiProperty()
  @IsArray()
  tags: Tag[];
}
