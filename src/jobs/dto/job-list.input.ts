import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { WORK_MODES } from "src/shared/interfaces";
import { toList } from "src/shared/helpers";
import { DateRange, ListOrder, JobListOrderBy } from "src/shared/types";
import { Compare } from "src/shared/validators";
import {
  ORGANIZATION_VERTICALS,
  OrganizationVertical,
} from "src/shared/organization-classifications";

const JOB_WORK_MODE_FILTERS = [...WORK_MODES, "fully-remote"] as const;

export class JobListParams {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  organizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  paysInCrypto?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  offersTokenAllocation?: boolean | null = null;

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
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  audits?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  hacks?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  tags?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  organizations?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  chains?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  ecosystems?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  projects?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  classifications?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "Canonical employer classifications from /jobs/filters; OR within this filter, AND with other filters",
    enum: ORGANIZATION_VERTICALS,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  @IsIn(ORGANIZATION_VERTICALS, { each: true })
  @Transform(toList)
  organizationClassifications?: OrganizationVertical[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  commitments?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  fundingRounds?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "Canonical current equity funding stages (for example seed or series-a)",
  })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  fundingStages?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  investors?: string[] | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  seniority?: string[] | null = null;

  @ApiPropertyOptional({
    description: "Canonical work modes returned by /jobs/filters",
    enum: JOB_WORK_MODE_FILTERS,
    isArray: true,
  })
  @IsOptional()
  @IsIn(JOB_WORK_MODE_FILTERS, { each: true })
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  workModes?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "Canonical place/timezone availability keys returned by /jobs/filters",
  })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  availability?: string[] | null = null;

  @ApiPropertyOptional({
    description: "Canonical city availability keys returned by /jobs/filters",
  })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  cities?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "Canonical administrative, world, or business region availability keys",
  })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  regions?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "Canonical country availability keys returned by /jobs/filters",
  })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  countries?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "Canonical continent availability keys returned by /jobs/filters",
  })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  continents?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "Canonical IANA timezone or UTC-offset keys returned by /jobs/filters",
  })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  timezones?: string[] | null = null;

  @ApiPropertyOptional({
    description:
      "UTC hour buckets in which the employer team's inferred collaboration band is active",
    example: "utc-08,utc-09",
  })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
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
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  newActiveLeads?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  steppedDownLeads?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  movedLeads?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  earlyLeadDepartures?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  recentlyFunded?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  token?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  onboardIntoWeb3?: boolean | null = null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
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
  @MaxLength(256)
  query: string | null = null;

  @ApiPropertyOptional({
    description: "Full-text search against job titles only",
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  titleQuery?: string | null = null;
}
