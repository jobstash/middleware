import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Transform, Type } from "class-transformer";

export type FundListOrderBy =
  | "lastInvestmentDate"
  | "totalInvestedCapital"
  | "knownRoundCapital"
  | "progressionRate"
  | "medianRoundSizeStepUp"
  | "medianValuationStepUp"
  | "soloRate"
  | "portfolioCount"
  | "staffCount"
  | "name";

export const FUND_ACTIVITY_WINDOWS = [
  "30d",
  "90d",
  "6m",
  "1y",
  "2y",
  "5y",
  "all",
  "custom",
] as const;

export type FundActivityWindow = (typeof FUND_ACTIVITY_WINDOWS)[number];

export class InvestorListParams {
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
  query?: string | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minInvestedCapital?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minKnownRoundCapital?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minPortfolioCount?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  minProgressionRate?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  hasJobs?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  hasTeamSocials?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  hasSoloInvestments?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sector?: string | null = null;

  @ApiPropertyOptional({ enum: FUND_ACTIVITY_WINDOWS, default: "1y" })
  @IsOptional()
  @IsIn(FUND_ACTIVITY_WINDOWS)
  @IsString()
  activityWindow?: FundActivityWindow | null = null;

  @ApiPropertyOptional({ example: "2025-01-01" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsString()
  fromDate?: string | null = null;

  @ApiPropertyOptional({ example: "2025-12-31" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsString()
  toDate?: string | null = null;

  @ApiPropertyOptional({
    description: "Comma-separated normalized funding round stages",
    example: "seed,series-a",
  })
  @IsOptional()
  @MaxLength(300)
  @IsString()
  rounds?: string | null = null;

  @ApiPropertyOptional({ enum: ["asc", "desc"] })
  @IsOptional()
  @IsIn(["asc", "desc"])
  @IsString()
  order?: "asc" | "desc" | null = null;

  @ApiPropertyOptional({
    enum: [
      "lastInvestmentDate",
      "totalInvestedCapital",
      "knownRoundCapital",
      "progressionRate",
      "medianRoundSizeStepUp",
      "medianValuationStepUp",
      "soloRate",
      "portfolioCount",
      "staffCount",
      "name",
    ],
  })
  @IsOptional()
  @IsIn([
    "lastInvestmentDate",
    "totalInvestedCapital",
    "knownRoundCapital",
    "progressionRate",
    "medianRoundSizeStepUp",
    "medianValuationStepUp",
    "soloRate",
    "portfolioCount",
    "staffCount",
    "name",
  ])
  @IsString()
  orderBy?: FundListOrderBy | null = null;
}
