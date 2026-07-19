import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { Transform, Type } from "class-transformer";

export type FundListOrderBy =
  | "lastInvestmentDate"
  | "totalInvestedCapital"
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
  minPortfolioCount?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  hasJobs?: boolean | null = null;

  @ApiPropertyOptional({ enum: ["asc", "desc"] })
  @IsOptional()
  @IsIn(["asc", "desc"])
  @IsString()
  order?: "asc" | "desc" | null = null;

  @ApiPropertyOptional({
    enum: [
      "lastInvestmentDate",
      "totalInvestedCapital",
      "portfolioCount",
      "staffCount",
      "name",
    ],
  })
  @IsOptional()
  @IsIn([
    "lastInvestmentDate",
    "totalInvestedCapital",
    "portfolioCount",
    "staffCount",
    "name",
  ])
  @IsString()
  orderBy?: FundListOrderBy | null = null;
}
