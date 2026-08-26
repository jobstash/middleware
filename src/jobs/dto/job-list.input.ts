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
import { WORK_MODES } from "src/shared/interfaces";
import { toList } from "src/shared/helpers";
import { DateRange, ListOrder, JobListOrderBy } from "src/shared/types";
import { Compare } from "src/shared/validators";

const JOB_WORK_MODE_FILTERS = [...WORK_MODES, "fully-remote"] as const;

export class JobListParams {
  @ApiPropertyOptional({
    example: "this-week",
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
  publicationDate?: DateRange | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minSalaryRange?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minSalaryRange", ">=")
  @Type(() => Number)
  maxSalaryRange?: number | null = null;

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
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minTvl?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minTvl", ">=")
  @Type(() => Number)
  maxTvl?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyVolume?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyVolume", ">=")
  @Type(() => Number)
  maxMonthlyVolume?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyFees?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyFees", ">=")
  @Type(() => Number)
  maxMonthlyFees?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minMonthlyRevenue?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minMonthlyRevenue", ">=")
  @Type(() => Number)
  maxMonthlyRevenue?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  audits?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  hacks?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  tags?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  organizations?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  chains?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  ecosystems?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  projects?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  classifications?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  commitments?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  fundingRounds?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "Canonical current equity funding stages (for example seed or series-a)",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  fundingStages?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  investors?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  seniority?: string[] | null = null;

  @ApiPropertyOptional({
    description: "Canonical work modes returned by /jobs/filters",
    enum: JOB_WORK_MODE_FILTERS,
    isArray: true,
  })
  @IsOptional()
  @IsIn(JOB_WORK_MODE_FILTERS, { each: true })
  @Type(() => String)
  @Transform(toList)
  workModes?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "Canonical place/timezone availability keys returned by /jobs/filters",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  availability?: string[] | null = null;

  @ApiPropertyOptional({
    description: "Canonical city availability keys returned by /jobs/filters",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  cities?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "Canonical administrative, world, or business region availability keys",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  regions?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "Canonical country availability keys returned by /jobs/filters",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  countries?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "Canonical continent availability keys returned by /jobs/filters",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  continents?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "Canonical IANA timezone or UTC-offset keys returned by /jobs/filters",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  timezones?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "UTC hour buckets in which the employer team's inferred collaboration band is active",
    example: "utc-08,utc-09",
  })
  @IsOptional()
  @Type(() => String)
  @Transform(toList)
  collaborationHours?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minCurrentMaintainers?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minCurrentMaintainers", ">=")
  @Type(() => Number)
  maxCurrentMaintainers?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minActiveLeads?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Compare("minActiveLeads", ">=")
  @Type(() => Number)
  maxActiveLeads?: number | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  newActiveLeads?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  steppedDownLeads?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  movedLeads?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  earlyLeadDepartures?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  recentlyFunded?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  token?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  onboardIntoWeb3?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  expertJobs?: boolean | null = null;

  @ApiPropertyOptional({
    enum: ["asc", "desc"],
  })
  @IsOptional()
  @IsIn(["asc", "desc"])
  @IsString()
  order?: ListOrder | null = null;

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
      "headcountEstimate",
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
    "headcountEstimate",
    "teamSize",
  ])
  @IsString()
  orderBy?: JobListOrderBy | null = null;

  @ApiPropertyOptional({
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number | null = null;

  @ApiPropertyOptional({
    example: 20,
  })
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
    description: "Matches job titles using the same rules as title suggestions",
  })
  @IsOptional()
  @IsString()
  @Type(() => String)
  titleQuery: string | null = null;
}
