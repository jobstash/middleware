import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { toList } from "src/shared/helpers";
import { SearchNav } from "src/shared/interfaces";
import { Compare } from "src/shared/validators";

export class SearchPillarFiltersParams {
  @IsString()
  @IsNotEmpty()
  @IsIn(["projects", "organizations", "grants", "impact", "vcs", "jobs"])
  nav: SearchNav;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  names: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  chains: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  categories: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  locations: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  investors: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  fundingRounds: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  tags: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  classifications?: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  commitments?: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  locationTypes?: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  organizations?: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  projects?: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  ecosystems?: string[] | null = null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minTvl?: number | null = null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minTvl", ">=")
  @Type(() => Number)
  maxTvl?: number | null = null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyVolume?: number | null = null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyVolume", ">=")
  @Type(() => Number)
  maxMonthlyVolume?: number | null = null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyFees?: number | null = null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyFees", ">=")
  @Type(() => Number)
  maxMonthlyFees?: number | null = null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyRevenue?: number | null = null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyRevenue", ">=")
  @Type(() => Number)
  maxMonthlyRevenue?: number | null = null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minHeadCount?: number | null = null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minHeadCount", ">=")
  @Type(() => Number)
  maxHeadCount?: number | null = null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minDate?: number | null = null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minDate", ">=")
  @Type(() => Number)
  maxDate?: number | null = null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minProgramBudget?: number | null = null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minProgramBudget", ">=")
  @Type(() => Number)
  maxProgramBudget?: number | null = null;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasProjects?: boolean | null = null;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasJobs?: boolean | null = null;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasAudits?: boolean | null = null;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasHacks?: boolean | null = null;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasToken?: boolean | null = null;
}
