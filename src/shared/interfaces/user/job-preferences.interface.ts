import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { JobListResult } from "../job-list-result.interface";
import { WORK_MODES, WorkLocationOption } from "../work-arrangement.interface";
import type { WorkMode } from "../work-arrangement.interface";

/** WorkArrangementV1 keeps remote-or-office arms as separate options. */

export const JOB_MATCH_RESOLUTION_CODES = [
  "add_country_for_exclusions",
  "add_country_for_eligibility",
  "geographic_scope_unstated",
  "location_eligibility_incomplete",
  "conflicting_work_arrangement",
  "remote_evidence_unqualified",
  "work_arrangement_unstated",
  "add_utc_offset",
  "work_authorization_review",
  "residency_review",
  "attendance_review",
  "travel_tolerance_review",
  "office_location_review",
  "office_location_missing",
  "sponsorship_unstated",
  "set_sponsorship_preference",
] as const;

export type JobMatchResolutionCode =
  (typeof JOB_MATCH_RESOLUTION_CODES)[number];

/**
 * The only public/saved Jobs For Me preference keys. Storage adapters may map
 * these names to database columns, but must never expose the retired aliases.
 */
export class JobPreferences {
  @ApiProperty({ enum: WORK_MODES, isArray: true })
  workModes: WorkMode[];

  @ApiPropertyOptional({ nullable: true, example: "NL" })
  residenceCountry: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 5.5,
    description: "UTC offset in hours; fractional offsets are supported.",
  })
  utcOffset: number | null;

  @ApiPropertyOptional({ nullable: true, example: "EU" })
  workAuthorization: string | null;

  @ApiPropertyOptional({ nullable: true })
  requiresSponsorship: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  attendancePreference: string | null;

  @ApiPropertyOptional({ nullable: true })
  travelTolerance: string | null;
}

export class JobMatchResolutionReason {
  @ApiProperty({ enum: JOB_MATCH_RESOLUTION_CODES })
  code: JobMatchResolutionCode;

  @ApiProperty()
  message: string;
}

export class JobForMe<TJob extends object = JobListResult> {
  @ApiProperty({ type: () => JobListResult })
  job: TJob;

  @ApiPropertyOptional({ type: () => WorkLocationOption, nullable: true })
  option: WorkLocationOption | null;

  @ApiProperty()
  explanation: string;

  @ApiProperty({ type: [JobMatchResolutionReason] })
  needsChecking: JobMatchResolutionReason[];

  @ApiProperty({ type: [String] })
  optionalSignals: string[];
}

export class JobsForMeSummary {
  @ApiProperty()
  confirmedMatches: number;

  @ApiProperty()
  timezoneNearMisses: number;

  @ApiProperty()
  needsChecking: number;

  @ApiProperty()
  total: number;
}

export class JobsForMeResponse<TJob extends object = JobListResult> {
  @ApiProperty({ type: [JobForMe] })
  confirmedMatches: JobForMe<TJob>[];

  @ApiProperty({ type: [JobForMe] })
  timezoneNearMisses: JobForMe<TJob>[];

  @ApiProperty({ type: [JobForMe] })
  needsChecking: JobForMe<TJob>[];

  @ApiProperty({ type: () => JobsForMeSummary })
  summary: JobsForMeSummary;

  @ApiProperty({ type: () => JobPreferences })
  appliedPreferences: JobPreferences;
}
