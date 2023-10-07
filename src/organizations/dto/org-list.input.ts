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
import { ListOrder, OrgListOrderBy } from "src/shared/types";
import { btoaList } from "src/shared/helpers";
import { Compare } from "src/shared/validators";

export class OrgListParams {
  @ApiPropertyOptional({
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minHeadCount?: number | null = null;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minHeadCount", ">=")
  @Type(() => Number)
  maxHeadCount?: number | null = null;

  @ApiPropertyOptional({
    example: "U2VlZA==,U2VyaWVzIEE=",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(btoaList)
  fundingRounds?: string[] | null = null;

  @ApiPropertyOptional({
    example: "U2VlZA==,U2VyaWVzIEE=",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(btoaList)
  investors?: string[] | null = null;

  @ApiPropertyOptional({
    example: "UmVtb3Rl,T25zaXRl",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(btoaList)
  locations?: string[] | null = null;

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasProjects?: boolean | null = null;

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasJobs?: boolean | null = null;

  @ApiPropertyOptional({
    enum: ["asc", "desc"],
  })
  @IsOptional()
  @IsIn(["asc", "desc"])
  @IsString()
  order?: ListOrder | null = null;

  @ApiPropertyOptional({
    enum: ["recentFundingDate", "headcountEstimate", "recentJobDate"],
  })
  @IsOptional()
  @IsIn(["recentFundingDate", "headcountEstimate", "recentJobDate"])
  @IsString()
  orderBy?: OrgListOrderBy | null = null;

  @ApiPropertyOptional({
    example: 500,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number | null = null;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number | null = null;

  @ApiPropertyOptional({
    example: "C++",
  })
  @IsOptional()
  @IsString()
  @Type(() => String)
  query: string | null = null;
}
