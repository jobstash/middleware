import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
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
