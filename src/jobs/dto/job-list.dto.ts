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
    example: 1644914275,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  minPublicationDate?: number;

  @ApiPropertyOptional({
    example: 1676450275,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_publication_date", ">=")
  @Type(() => Number)
  maxPublicationDate?: number;

  @ApiPropertyOptional({
    example: 90000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  minSalary?: number;

  @ApiPropertyOptional({
    example: 150000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_salary", ">=")
  @Type(() => Number)
  maxSalary?: number;

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
  @Compare("min_head_count", ">=")
  @Type(() => Number)
  maxHeadCount?: number;

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
  @Compare("min_tvl", ">=")
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
  @Compare("min_monthly_volume", ">=")
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
  @Compare("min_monthly_fees", ">=")
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
  @Compare("min_monthly_revenue", ">=")
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
  @Compare("min_audits", ">=")
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
  @Compare("min_hacks", ">=")
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

  //TODO: Include example chain filter
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
    enum: [1, 2, 3, 4, 5],
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  level?: number;

  @ApiPropertyOptional({
    example: "Remote,Onsite",
  })
  @IsOptional()
  @IsString()
  @Type(() => String)
  location?: string;

  @ApiPropertyOptional({
    enum: ["asc", "desc"],
  })
  @IsOptional()
  @IsIn(["asc", "desc"])
  @IsString()
  order?: JobListOrder;

  @ApiPropertyOptional({
    enum: [
      "publication_date",
      "tvl",
      "salary",
      "funding_date",
      "monthly_volume",
      "monthly_fees",
      "monthly_revenue",
      "audits",
      "hacks",
      "chains",
      "head_count",
    ],
  })
  @IsOptional()
  @IsIn([
    "publication_date",
    "tvl",
    "salary",
    "funding_date",
    "monthly_volume",
    "monthly_fees",
    "monthly_revenue",
    "audits",
    "hacks",
    "chains",
    "head_count",
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
