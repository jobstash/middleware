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
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_publication_date?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_publication_date", ">=")
  @Type(() => Number)
  max_publication_date?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_salary?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_salary", ">=")
  @Type(() => Number)
  max_salary?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_head_count?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_head_count", ">=")
  @Type(() => Number)
  max_head_count?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_tvl?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_tvl", ">=")
  @Type(() => Number)
  max_tvl?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_monthly_volume?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_monthly_volume", ">=")
  @Type(() => Number)
  max_monthly_volume?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_monthly_active_users?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_monthly_active_users", ">=")
  @Type(() => Number)
  max_monthly_active_users?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_monthly_revenue?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_monthly_revenue", ">=")
  @Type(() => Number)
  max_monthly_revenue?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_audits?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_audits", ">=")
  @Type(() => Number)
  max_audits?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  min_hacks?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Compare("min_hacks", ">=")
  @Type(() => Number)
  max_hacks?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  @Transform(({ value }) => value.split(","))
  tech?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  @Transform(({ value }) => value.split(","))
  organizations?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  @Transform(({ value }) => value.split(","))
  chains?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  @Transform(({ value }) => value.split(","))
  projects?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  @Transform(({ value }) => value.split(","))
  categories?: string[];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  token?: boolean;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  level?: number;

  @IsOptional()
  @IsIn(["asc", "desc"])
  @IsString()
  order?: JobListOrder;

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

  @IsOptional()
  @IsNumber()
  skip?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
