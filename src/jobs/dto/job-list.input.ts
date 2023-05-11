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
import { JobListOrder, JobListOrderBy } from "src/shared/types";
import { btoaList } from "src/shared/utils/helpers";
import { Compare } from "src/shared/validators";

export class JobListParams {
  @ApiPropertyOptional({
    example: "This Week",
    enum: [
      "today",
      "this-week",
      "this-month",
      "past-2-weeks",
      "past-3-months",
      "past-6-months",
    ],
  })
  @IsOptional()
  @IsString()
  @IsIn([
    "today",
    "this-week",
    "this-month",
    "past-2-weeks",
    "past-3-months",
    "past-6-months",
  ])
  @Type(() => String)
  publicationDate?: string;

  @ApiPropertyOptional({
    example: 90000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minSalaryRange?: number;

  @ApiPropertyOptional({
    example: 150000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minSalaryRange", ">=")
  @Type(() => Number)
  maxSalaryRange?: number;

  @ApiPropertyOptional({
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minHeadCount?: number;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minHeadCount", ">=")
  @Type(() => Number)
  maxHeadCount?: number;

  @ApiPropertyOptional({
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minTeamSize?: number;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minTeamSize", ">=")
  @Type(() => Number)
  maxTeamSize?: number;

  @ApiPropertyOptional({
    example: 1890503.6980031824,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minTvl?: number;

  @ApiPropertyOptional({
    example: 5000503.698003182,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minTvl", ">=")
  @Type(() => Number)
  maxTvl?: number;

  @ApiPropertyOptional({
    example: 1000000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyVolume?: number;

  @ApiPropertyOptional({
    example: 1000000000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyVolume", ">=")
  @Type(() => Number)
  maxMonthlyVolume?: number;

  @ApiPropertyOptional({
    example: 50000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyFees?: number;

  @ApiPropertyOptional({
    example: 3000000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyFees", ">=")
  @Type(() => Number)
  maxMonthlyFees?: number;

  @ApiPropertyOptional({
    example: 1000000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyRevenue?: number;

  @ApiPropertyOptional({
    example: 5000000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyRevenue", ">=")
  @Type(() => Number)
  maxMonthlyRevenue?: number;

  @ApiPropertyOptional({
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minAudits?: number;

  @ApiPropertyOptional({
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minAudits", ">=")
  @Type(() => Number)
  maxAudits?: number;

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hacks?: boolean;

  @ApiPropertyOptional({
    example: "U3RyaW5n,Qysr",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(btoaList)
  tech?: string[];

  @ApiPropertyOptional({
    example: "T3BlblNlYQ==,SmV0",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(btoaList)
  organizations?: string[];

  @ApiPropertyOptional({
    example: "N/A",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(btoaList)
  chains?: string[];

  @ApiPropertyOptional({
    example: "T3BlbnNlYQ==,QWNyb3Nz",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(btoaList)
  projects?: string[];

  @ApiPropertyOptional({
    example: "T3B0aW9ucw==,WWllbGQ=",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(btoaList)
  categories?: string[];

  @ApiPropertyOptional({
    example: "U2VlZA==,U2VyaWVzIEE=",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(btoaList)
  fundingRounds?: string[];

  @ApiPropertyOptional({
    example: "TGVtbmlzY2Fw,M0FD",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(btoaList)
  investors?: string[];

  @ApiPropertyOptional({
    example: "MQ==,Mg==",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(btoaList)
  seniority?: string[];

  @ApiPropertyOptional({
    example: "UmVtb3Rl,T25zaXRl",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(btoaList)
  locations?: string[];

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  token?: boolean;

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  mainNet?: boolean;

  @ApiPropertyOptional({
    enum: ["asc", "desc"],
  })
  @IsOptional()
  @IsIn(["asc", "desc"])
  @IsString()
  order?: JobListOrder;

  @ApiPropertyOptional({
    enum: [
      "publicationDate",
      "tvl",
      "salary",
      "fundingDate",
      "monthlyVolume",
      "monthlyFees",
      "monthlyRevenue",
      "audits",
      "hacks",
      "chains",
      "headCount",
      "teamSize",
    ],
  })
  @IsOptional()
  @IsIn([
    "publicationDate",
    "tvl",
    "salary",
    "fundingDate",
    "monthlyVolume",
    "monthlyFees",
    "monthlyRevenue",
    "audits",
    "hacks",
    "chains",
    "headCount",
    "teamSize",
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

  @ApiPropertyOptional({
    example: "C++",
  })
  @IsOptional()
  @IsString()
  @Type(() => String)
  query: string;
}
