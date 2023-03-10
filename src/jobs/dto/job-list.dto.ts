import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from "class-validator";
import { JobListOrder, JobListOrderBy } from "src/shared/types";
import { Compare } from "src/shared/validators";

export class JobListParams {
  @ApiPropertyOptional({
    example: "This Week",
    enum: [
      "today",
      "this-week",
      "this-month",
      "past-2-weeks",
      "past-3-months",
      "past-6-months",
    ],
  })
  @IsOptional()
  @IsString()
  @IsIn([
    "today",
    "this-week",
    "this-month",
    "past-2-weeks",
    "past-3-months",
    "past-6-months",
  ])
  @Type(() => String)
  publicationDate?: string;

  @ApiPropertyOptional({
    example: 90000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  minSalaryRange?: number;

  @ApiPropertyOptional({
    example: 150000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("minSalaryRange", ">=")
  @Type(() => Number)
  maxSalaryRange?: number;

  @ApiPropertyOptional({
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  minHeadCount?: number;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("minHeadCount", ">=")
  @Type(() => Number)
  maxHeadCount?: number;

  @ApiPropertyOptional({
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  minTeamSize?: number;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("minTeamSize", ">=")
  @Type(() => Number)
  maxTeamSize?: number;

  @ApiPropertyOptional({
    example: 1890503.6980031824,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  minTvl?: number;

  @ApiPropertyOptional({
    example: 5000503.698003182,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("minTvl", ">=")
  @Type(() => Number)
  maxTvl?: number;

  @ApiPropertyOptional({
    example: 1000000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  minMonthlyVolume?: number;

  @ApiPropertyOptional({
    example: 1000000000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("minMonthlyVolume", ">=")
  @Type(() => Number)
  maxMonthlyVolume?: number;

  @ApiPropertyOptional({
    example: 50000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  minMonthlyFees?: number;

  @ApiPropertyOptional({
    example: 3000000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("minMonthlyFees", ">=")
  @Type(() => Number)
  maxMonthlyFees?: number;

  @ApiPropertyOptional({
    example: 1000000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  minMonthlyRevenue?: number;

  @ApiPropertyOptional({
    example: 5000000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("minMonthlyRevenue", ">=")
  @Type(() => Number)
  maxMonthlyRevenue?: number;

  @ApiPropertyOptional({
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  minAudits?: number;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("minAudits", ">=")
  @Type(() => Number)
  maxAudits?: number;

  @ApiPropertyOptional({
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  minHacks?: number;

  @ApiPropertyOptional({
    example: 40,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("minHacks", ">=")
  @Type(() => Number)
  maxHacks?: number;

  @ApiPropertyOptional({
    example: "String,C++",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  @Transform(({ value }) => value.split(","))
  tech?: string[];

  @ApiPropertyOptional({
    example: "OpenSea,Jet",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  @Transform(({ value }) => value.split(","))
  organizations?: string[];

  @ApiPropertyOptional({
    example: "N/A",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  @Transform(({ value }) => value.split(","))
  chains?: string[];

  @ApiPropertyOptional({
    example: "Opensea,Across",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  @Transform(({ value }) => value.split(","))
  projects?: string[];

  @ApiPropertyOptional({
    example: "Options,Yield",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  @Transform(({ value }) => value.split(","))
  categories?: string[];

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  token?: boolean;

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  mainNet?: boolean;

  @ApiPropertyOptional({
    example: "1",
  })
  @IsOptional()
  @IsString()
  @Type(() => String)
  seniority?: string;

  @ApiPropertyOptional({
    example: "Remote,Onsite",
  })
  @IsOptional()
  @IsString()
  @Type(() => String)
  locations?: string;

  @ApiPropertyOptional({
    enum: ["asc", "desc"],
  })
  @IsOptional()
  @IsIn(["asc", "desc"])
  @IsString()
  order?: JobListOrder;

  @ApiPropertyOptional({
    enum: [
      "publicationDate",
      "tvl",
      "salary",
      "fundingDate",
      "monthlyVolume",
      "monthlyFees",
      "monthlyRevenue",
      "audits",
      "hacks",
      "chains",
      "headCount",
      "teamSize",
    ],
  })
  @IsOptional()
  @IsIn([
    "publicationDate",
    "tvl",
    "salary",
    "fundingDate",
    "monthlyVolume",
    "monthlyFees",
    "monthlyRevenue",
    "audits",
    "hacks",
    "chains",
    "headCount",
    "teamSize",
  ])
  @IsString()
  orderBy?: JobListOrderBy;

  @ApiPropertyOptional({
    example: 500,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Transform(({ value }) => Number(value))
  page?: number;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Transform(({ value }) => Number(value))
  limit?: number;
}
