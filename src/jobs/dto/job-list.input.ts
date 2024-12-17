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
import { toList } from "src/shared/helpers";
import { DateRange, ListOrder, JobListOrderBy } from "src/shared/types";
import { Compare } from "src/shared/validators";

export class JobListParams {
  @ApiPropertyOptional({
    example: "this-week",
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
  publicationDate?: DateRange | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minSalaryRange?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minSalaryRange", ">=")
  @Type(() => Number)
  maxSalaryRange?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minHeadCount?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minHeadCount", ">=")
  @Type(() => Number)
  maxHeadCount?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minTvl?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minTvl", ">=")
  @Type(() => Number)
  maxTvl?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyVolume?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyVolume", ">=")
  @Type(() => Number)
  maxMonthlyVolume?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyFees?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyFees", ">=")
  @Type(() => Number)
  maxMonthlyFees?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyRevenue?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyRevenue", ">=")
  @Type(() => Number)
  maxMonthlyRevenue?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  audits?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  hacks?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  tags?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  chains?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  communities?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  projects?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  classifications?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  commitments?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  fundingRounds?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  investors?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  seniority?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  locations?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  token?: boolean | null = null;

  @ApiPropertyOptional({
    enum: ["asc", "desc"],
  })
  @IsOptional()
  @IsIn(["asc", "desc"])
  @IsString()
  order?: ListOrder | null = null;

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
      "headcountEstimate",
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
    "headcountEstimate",
    "teamSize",
  ])
  @IsString()
  orderBy?: JobListOrderBy | null = null;

  @ApiPropertyOptional({
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number | null = null;

  @ApiPropertyOptional({
    example: 20,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => String)
  query: string | null = null;
}
