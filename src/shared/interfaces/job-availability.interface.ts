import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import * as t from "io-ts";

export class JobAvailability {
  public static readonly JobAvailabilityType = t.strict({
    requirement: t.union([t.literal("required"), t.literal("preferred")]),
    workMode: t.union([
      t.literal("remote"),
      t.literal("hybrid"),
      t.literal("onsite"),
      t.undefined,
    ]),
    placeId: t.union([t.string, t.undefined]),
    placeName: t.union([t.string, t.undefined]),
    placeText: t.union([t.string, t.undefined]),
    placeKind: t.union([
      t.literal("city"),
      t.literal("administrative_area"),
      t.literal("country"),
      t.literal("world_region"),
      t.literal("continent"),
      t.literal("business_region"),
      t.undefined,
    ]),
    ancestorPlaceIds: t.union([t.array(t.string), t.undefined]),
    placeTimezoneIds: t.union([t.array(t.string), t.undefined]),
    timezoneKind: t.union([t.string, t.undefined]),
    timezone: t.union([t.string, t.undefined]),
    minimumUtcOffsetMinutes: t.union([t.number, t.undefined]),
    maximumUtcOffsetMinutes: t.union([t.number, t.undefined]),
    rawText: t.string,
    confidence: t.number,
    extractorVersion: t.string,
  });

  @ApiProperty({ enum: ["required", "preferred"] })
  requirement: "required" | "preferred";

  @ApiPropertyOptional({ enum: ["remote", "hybrid", "onsite"] })
  workMode?: "remote" | "hybrid" | "onsite";

  @ApiPropertyOptional()
  placeId?: string;

  @ApiPropertyOptional()
  placeName?: string;

  @ApiPropertyOptional()
  placeText?: string;

  @ApiPropertyOptional({
    enum: [
      "city",
      "administrative_area",
      "country",
      "world_region",
      "continent",
      "business_region",
    ],
  })
  placeKind?:
    | "city"
    | "administrative_area"
    | "country"
    | "world_region"
    | "continent"
    | "business_region";

  @ApiPropertyOptional({ type: [String] })
  ancestorPlaceIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  placeTimezoneIds?: string[];

  @ApiPropertyOptional()
  timezoneKind?: string;

  @ApiPropertyOptional()
  timezone?: string;

  @ApiPropertyOptional()
  minimumUtcOffsetMinutes?: number;

  @ApiPropertyOptional()
  maximumUtcOffsetMinutes?: number;

  @ApiProperty()
  rawText: string;

  @ApiProperty()
  confidence: number;

  @ApiProperty()
  extractorVersion: string;
}
