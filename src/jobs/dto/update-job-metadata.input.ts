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

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsPositive()
  @IsOptional()
  salary: number | null = null;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  summary: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  culture: string | null = null;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  location: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  seniority: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paysInCrypto: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  minimumSalary: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maximumSalary: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salaryCurrency: string | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  offersTokenAllocation: boolean | null = null;

  @ApiProperty()
  @IsNotEmpty()
  @IsBoolean()
  protected: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  onboardIntoWeb3: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ethSeasonOfInternships: boolean | null = null;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  commitment: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  classification: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  project: string | null = null;

  @ApiProperty()
  @IsNotEmpty()
  @IsBoolean()
  isBlocked: boolean;

  @ApiProperty()
  @IsNotEmpty()
  @IsBoolean()
  isOnline: boolean;

  @ApiProperty()
  @IsArray()
  tags: Tag[];
}
