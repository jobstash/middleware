import { applyDecorators } from "@nestjs/common";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDivisibleBy,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  EDUCATION_LEVELS,
  EducationLevel,
  JOB_SEARCH_STATUSES,
  JobSearchStatus,
  WORK_MODES,
  WorkMode,
} from "src/shared/interfaces";

const IsPreferenceList = (): ReturnType<typeof applyDecorators> =>
  applyDecorators(
    IsOptional(),
    IsArray(),
    ArrayUnique(),
    ArrayMaxSize(30),
    IsString({ each: true }),
    MaxLength(160, { each: true }),
  );

export class UpdateJobPreferencesInput {
  @ApiProperty({ enum: WORK_MODES, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(WORK_MODES, { each: true })
  workModes: WorkMode[];

  @ApiPropertyOptional({ nullable: true, example: "NL" })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  residenceCountry: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 5.5,
    description: "UTC offset in hours; fractional offsets are supported.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsDivisibleBy(0.25)
  @Min(-12)
  @Max(14)
  utcOffset: number | null;

  @ApiPropertyOptional({ nullable: true, example: "EU" })
  @IsOptional()
  @IsString()
  workAuthorization: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  requiresSponsorship: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsIn([
    "remote_only",
    "remote_preferred",
    "hybrid_ok",
    "onsite_ok",
    "unstated",
  ])
  attendancePreference: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  travelTolerance: string | null;

  @ApiPropertyOptional({ enum: JOB_SEARCH_STATUSES, nullable: true })
  @IsOptional()
  @IsIn(JOB_SEARCH_STATUSES)
  searchStatus?: JobSearchStatus | null;

  @ApiPropertyOptional({ type: [String] })
  @IsPreferenceList()
  rolePriorities?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsPreferenceList()
  targetOrganizations?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsPreferenceList()
  languages?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsPreferenceList()
  jobCategories?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsPreferenceList()
  seniorityLevels?: string[];

  @ApiPropertyOptional({ enum: EDUCATION_LEVELS, nullable: true })
  @IsOptional()
  @IsIn(EDUCATION_LEVELS)
  educationLevel?: EducationLevel | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(1_000_000)
  companySizeMin?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(1_000_000)
  companySizeMax?: number | null;

  @ApiPropertyOptional({ type: [String] })
  @IsPreferenceList()
  industries?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsPreferenceList()
  preferredSkills?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(100_000_000)
  minimumSalary?: number | null;

  @ApiPropertyOptional({ nullable: true, example: "USD" })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  salaryCurrency?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsPreferenceList()
  fundingStages?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsPreferenceList()
  paymentCurrencies?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsPreferenceList()
  commitments?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsUrl({ require_protocol: true }, { each: true })
  showcaseRepositories?: string[];
}
