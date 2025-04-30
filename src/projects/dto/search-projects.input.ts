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
import { ListOrder, ProjectListOrderBy } from "src/shared/enums";
import { toList } from "src/shared/helpers";
import { Compare } from "src/shared/validators";

export class SearchProjectsInput {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  categories?: string[] | null = null;

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
  investors?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  names?: string[] | null = null;

  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  ecosystems?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  organizations?: string[] | null = null;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => String)
  query: string | null = null;

  @ApiPropertyOptional({
    enum: ["asc", "desc"],
  })
  @IsOptional()
  @IsIn(["asc", "desc"])
  @IsString()
  order?: ListOrder | null = null;

  @ApiPropertyOptional({
    enum: [
      "tvl",
      "monthlyVolume",
      "monthlyFees",
      "monthlyRevenue",
      "audits",
      "hacks",
      "chains",
    ],
  })
  @IsOptional()
  @IsIn([
    "tvl",
    "monthlyVolume",
    "monthlyFees",
    "monthlyRevenue",
    "audits",
    "hacks",
    "chains",
  ])
  @IsString()
  orderBy?: ProjectListOrderBy | null = null;
}
