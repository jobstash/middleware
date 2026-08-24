import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import * as t from "io-ts";

export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const WORK_ARRANGEMENT_CLASSIFICATIONS = [
  "verified_remote",
  "verified_hybrid",
  "verified_onsite",
  "remote_unqualified",
  "conflicting",
  "unstated",
] as const;
export type WorkArrangementClassification =
  (typeof WORK_ARRANGEMENT_CLASSIFICATIONS)[number];

const WorkModeType = t.union([
  t.literal("remote"),
  t.literal("hybrid"),
  t.literal("onsite"),
]);

const WorkArrangementClassificationType = t.union([
  t.literal("verified_remote"),
  t.literal("verified_hybrid"),
  t.literal("verified_onsite"),
  t.literal("remote_unqualified"),
  t.literal("conflicting"),
  t.literal("unstated"),
]);

const WorkRegionType = t.union([
  t.literal("EU"),
  t.literal("Europe"),
  t.literal("EMEA"),
  t.literal("AMER"),
  t.literal("LATAM"),
  t.literal("APAC"),
]);

export class WorkArrangementUtcBand {
  public static readonly WorkArrangementUtcBandType = t.strict({
    minimumUtcOffset: t.number,
    maximumUtcOffset: t.number,
  });

  @ApiProperty()
  minimumUtcOffset: number;

  @ApiProperty()
  maximumUtcOffset: number;
}

export class WorkLocationOption {
  public static readonly WorkLocationOptionType = t.strict({
    classification: WorkArrangementClassificationType,
    mode: WorkModeType,
    scope: t.union([
      t.literal("global"),
      t.literal("region"),
      t.literal("country_list"),
      t.literal("unstated"),
    ]),
    includedCountries: t.array(t.string),
    excludedCountries: t.array(t.string),
    includedRegions: t.array(WorkRegionType),
    excludedRegions: t.array(WorkRegionType),
    requiredUtcBand: t.union([
      WorkArrangementUtcBand.WorkArrangementUtcBandType,
      t.null,
    ]),
    preferredUtcBand: t.union([
      WorkArrangementUtcBand.WorkArrangementUtcBandType,
      t.null,
    ]),
    residencyRequirements: t.array(t.string),
    workAuthorizationRequirements: t.array(t.string),
    sponsorshipStatus: t.union([
      t.literal("available"),
      t.literal("unavailable"),
      t.literal("case_by_case"),
      t.literal("unstated"),
    ]),
    officeCity: t.union([t.string, t.null]),
    attendanceCadence: t.union([t.string, t.null]),
    travelRequirement: t.union([t.string, t.null]),
    confidence: t.union([
      t.literal("source_stated"),
      t.literal("parsed"),
      t.literal("inherited"),
    ]),
  });

  @ApiProperty({ enum: WORK_ARRANGEMENT_CLASSIFICATIONS })
  classification: WorkArrangementClassification;

  @ApiProperty({ enum: WORK_MODES })
  mode: WorkMode;

  @ApiProperty({ enum: ["global", "region", "country_list", "unstated"] })
  scope: "global" | "region" | "country_list" | "unstated";

  @ApiProperty({ type: [String] })
  includedCountries: string[];

  @ApiProperty({ type: [String] })
  excludedCountries: string[];

  @ApiProperty({
    type: [String],
    enum: ["EU", "Europe", "EMEA", "AMER", "LATAM", "APAC"],
  })
  includedRegions: Array<"EU" | "Europe" | "EMEA" | "AMER" | "LATAM" | "APAC">;

  @ApiProperty({
    type: [String],
    enum: ["EU", "Europe", "EMEA", "AMER", "LATAM", "APAC"],
  })
  excludedRegions: Array<"EU" | "Europe" | "EMEA" | "AMER" | "LATAM" | "APAC">;

  @ApiPropertyOptional({ type: () => WorkArrangementUtcBand, nullable: true })
  requiredUtcBand: WorkArrangementUtcBand | null;

  @ApiPropertyOptional({ type: () => WorkArrangementUtcBand, nullable: true })
  preferredUtcBand: WorkArrangementUtcBand | null;

  @ApiProperty({ type: [String] })
  residencyRequirements: string[];

  @ApiProperty({ type: [String] })
  workAuthorizationRequirements: string[];

  @ApiProperty({
    enum: ["available", "unavailable", "case_by_case", "unstated"],
  })
  sponsorshipStatus: "available" | "unavailable" | "case_by_case" | "unstated";

  @ApiPropertyOptional({ nullable: true })
  officeCity: string | null;

  @ApiPropertyOptional({ nullable: true })
  attendanceCadence: string | null;

  @ApiPropertyOptional({ nullable: true })
  travelRequirement: string | null;

  @ApiProperty({ enum: ["source_stated", "parsed", "inherited"] })
  confidence: "source_stated" | "parsed" | "inherited";
}

/**
 * Public WorkArrangementV1. Alternative remote-or-office arms stay in their
 * respective mode arrays and retain their source trust.
 */
export class WorkArrangementV1 {
  public static readonly WorkArrangementV1Type = t.strict({
    classification: WorkArrangementClassificationType,
    fullyRemote: t.union([t.boolean, t.null]),
    remoteOptions: t.array(WorkLocationOption.WorkLocationOptionType),
    hybridOptions: t.array(WorkLocationOption.WorkLocationOptionType),
    onsiteOptions: t.array(WorkLocationOption.WorkLocationOptionType),
  });

  @ApiProperty({ enum: WORK_ARRANGEMENT_CLASSIFICATIONS })
  classification: WorkArrangementClassification;

  @ApiPropertyOptional({ nullable: true })
  fullyRemote: boolean | null;

  @ApiProperty({ type: [WorkLocationOption] })
  remoteOptions: WorkLocationOption[];

  @ApiProperty({ type: [WorkLocationOption] })
  hybridOptions: WorkLocationOption[];

  @ApiProperty({ type: [WorkLocationOption] })
  onsiteOptions: WorkLocationOption[];
}

export const EMPTY_WORK_ARRANGEMENT_V1: WorkArrangementV1 = {
  classification: "unstated",
  fullyRemote: null,
  remoteOptions: [],
  hybridOptions: [],
  onsiteOptions: [],
};
