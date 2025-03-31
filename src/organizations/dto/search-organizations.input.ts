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
import { ListOrder, OrgListOrderBy } from "src/shared/enums";
import { toList } from "src/shared/helpers";
import { Compare } from "src/shared/validators";

export class SearchOrganizationsInput {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  locations?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  investors?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  fundingRounds?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  tags?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  names?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  chains?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  projects?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  communities?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  ecosystems?: string[] | null = null;

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
  @IsBoolean()
  @Type(() => Boolean)
  hasJobs?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasProjects?: boolean | null = null;

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

  @ApiPropertyOptional({
    enum: ["asc", "desc"],
  })
  @IsOptional()
  @IsIn(["asc", "desc"])
  @IsString()
  order?: ListOrder | null = null;

  @ApiPropertyOptional({
    enum: ["recentFundingDate", "headcountEstimate", "rating", "name"],
  })
  @IsOptional()
  @IsIn(["recentFundingDate", "headcountEstimate", "rating", "name"])
  @IsString()
  orderBy?: OrgListOrderBy | null = null;
}
