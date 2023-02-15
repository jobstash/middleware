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
  min_publication_date?: number;

  @ApiPropertyOptional({
    example: 1676450275,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_publication_date", ">=")
  @Type(() => Number)
  max_publication_date?: number;

  @ApiPropertyOptional({
    example: 90000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_salary?: number;

  @ApiPropertyOptional({
    example: 150000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_salary", ">=")
  @Type(() => Number)
  max_salary?: number;

  @ApiPropertyOptional({
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_head_count?: number;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_head_count", ">=")
  @Type(() => Number)
  max_head_count?: number;

  @ApiPropertyOptional({
    example: 1890503.6980031824,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_tvl?: number;

  @ApiPropertyOptional({
    example: 5000503.698003182,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_tvl", ">=")
  @Type(() => Number)
  max_tvl?: number;

  @ApiPropertyOptional({
    example: 1000000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_monthly_volume?: number;

  @ApiPropertyOptional({
    example: 1000000000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_monthly_volume", ">=")
  @Type(() => Number)
  max_monthly_volume?: number;

  @ApiPropertyOptional({
    example: 50000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_monthly_active_users?: number;

  @ApiPropertyOptional({
    example: 3000000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_monthly_active_users", ">=")
  @Type(() => Number)
  max_monthly_active_users?: number;

  @ApiPropertyOptional({
    example: 1000000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_monthly_revenue?: number;

  @ApiPropertyOptional({
    example: 5000000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_monthly_revenue", ">=")
  @Type(() => Number)
  max_monthly_revenue?: number;

  @ApiPropertyOptional({
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_audits?: number;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_audits", ">=")
  @Type(() => Number)
  max_audits?: number;

  @ApiPropertyOptional({
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_hacks?: number;

  @ApiPropertyOptional({
    example: 40,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_hacks", ">=")
  @Type(() => Number)
  max_hacks?: number;

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
      "monthly_active_users",
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
    "monthly_active_users",
    "monthly_revenue",
    "audits",
    "hacks",
    "chains",
    "head_count",
  ])
  @IsString()
  order_by?: JobListOrderBy;

  @ApiPropertyOptional({
    example: 500,
  })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  limit?: number;
}
