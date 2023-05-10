import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
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
  @Min(0)
  @Type(() => Number)
  minSalaryRange?: number;

  @ApiPropertyOptional({
    example: 150000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minSalaryRange", ">=")
  @Type(() => Number)
  maxSalaryRange?: number;

  @ApiPropertyOptional({
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minHeadCount?: number;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minHeadCount", ">=")
  @Type(() => Number)
  maxHeadCount?: number;

  @ApiPropertyOptional({
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minTeamSize?: number;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minTeamSize", ">=")
  @Type(() => Number)
  maxTeamSize?: number;

  @ApiPropertyOptional({
    example: 1890503.6980031824,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minTvl?: number;

  @ApiPropertyOptional({
    example: 5000503.698003182,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minTvl", ">=")
  @Type(() => Number)
  maxTvl?: number;

  @ApiPropertyOptional({
    example: 1000000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyVolume?: number;

  @ApiPropertyOptional({
    example: 1000000000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyVolume", ">=")
  @Type(() => Number)
  maxMonthlyVolume?: number;

  @ApiPropertyOptional({
    example: 50000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyFees?: number;

  @ApiPropertyOptional({
    example: 3000000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyFees", ">=")
  @Type(() => Number)
  maxMonthlyFees?: number;

  @ApiPropertyOptional({
    example: 1000000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyRevenue?: number;

  @ApiPropertyOptional({
    example: 5000000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyRevenue", ">=")
  @Type(() => Number)
  maxMonthlyRevenue?: number;

  @ApiPropertyOptional({
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minAudits?: number;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minAudits", ">=")
  @Type(() => Number)
  maxAudits?: number;

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hacks?: boolean;

  @ApiPropertyOptional({
    example: "String,C++",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value?.toString().split(","))
  tech?: string[];

  @ApiPropertyOptional({
    example: "OpenSea,Jet",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value?.toString().split(","))
  organizations?: string[];

  @ApiPropertyOptional({
    example: "N/A",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value?.toString().split(","))
  chains?: string[];

  @ApiPropertyOptional({
    example: "Opensea,Across",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value?.toString().split(","))
  projects?: string[];

  @ApiPropertyOptional({
    example: "Options,Yield",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value?.toString().split(","))
  categories?: string[];

  @ApiPropertyOptional({
    example: "Seed,Series A",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value?.toString().split(","))
  fundingRounds?: string[];

  @ApiPropertyOptional({
    example: "Lemniscap,3AC",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value?.toString().split(","))
  investors?: string[];

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
    example: "1,2",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value?.toString().split(","))
  seniority?: string;

  @ApiPropertyOptional({
    example: "Remote,Onsite",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value?.toString().split(","))
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

  @ApiPropertyOptional({
    example: "C++",
  })
  @IsOptional()
  @IsString()
  @Type(() => String)
  query: string;
}
