import { BadRequestException } from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Max,
  Min,
  MinLength,
} from "class-validator";

export class ScreeningLocationPreferences {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) currentLocation?: string | null;
  @IsOptional() @IsIn(["not_open", "specific_locations", "open_anywhere"])
  relocation?: "not_open" | "specific_locations" | "open_anywhere" | null;
  @IsOptional() @IsString() @MaxLength(500) destinations?: string | null;
  @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}

export class ScreeningPreferencesInput extends ScreeningLocationPreferences {
  @IsOptional() @IsString() @MaxLength(1000) workAuthorization?: string | null;
  @IsOptional() @IsBoolean() requiresSponsorship?: boolean | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100000000) minimumSalary?: number | null;
  @IsOptional() @Matches(/^[A-Z]{3}$/) salaryCurrency?: string | null;
}

export type ScreeningPreferences = {
  preferences: ScreeningLocationPreferences | null;
  workAuthorization: string | null;
  requiresSponsorship: boolean | null;
  minimumSalary: number | null;
  salaryCurrency: string | null;
};

export function locationPreferences(
  value: unknown,
  previous?: ScreeningLocationPreferences | null,
): ScreeningLocationPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException("Invalid location or relocation preferences.");
  const patch = value as ScreeningLocationPreferences;
  const p = {
    currentLocation: patch.currentLocation === undefined ? previous?.currentLocation ?? null : patch.currentLocation,
    relocation: patch.relocation === undefined ? previous?.relocation ?? null : patch.relocation,
    destinations: patch.destinations === undefined ? previous?.destinations ?? null : patch.destinations,
    notes: patch.notes === undefined ? previous?.notes ?? null : patch.notes,
  };
  if (
    (p.currentLocation != null &&
      (typeof p.currentLocation !== "string" || !p.currentLocation.trim() || p.currentLocation.length > 200)) ||
    (p.relocation != null && !["not_open", "specific_locations", "open_anywhere"].includes(p.relocation)) ||
    (p.destinations != null && (typeof p.destinations !== "string" || p.destinations.length > 500)) ||
    (p.notes != null && (typeof p.notes !== "string" || p.notes.length > 500))
  )
    throw new BadRequestException("Invalid location or relocation preferences.");
  return {
    currentLocation: p.currentLocation?.trim() ?? null,
    relocation: p.relocation,
    destinations: p.destinations?.trim() ?? null,
    notes: p.notes?.trim() ?? null,
  };
}
