import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";
import { WorkMode } from "src/shared/interfaces";

const WORK_MODES: WorkMode[] = [
  "remote",
  "hybrid",
  "onsite",
  "remote_or_office",
];

export class UpdateJobPreferencesInput {
  @ApiPropertyOptional({ nullable: true, example: "NL" })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  residenceCountry: string | null;

  @ApiPropertyOptional({ nullable: true, example: "EU" })
  @IsOptional()
  @IsString()
  residenceRegion: string | null;

  @ApiPropertyOptional({ nullable: true, example: "Europe/Amsterdam" })
  @IsOptional()
  @Matches(/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/)
  ianaTimezone: string | null;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Type(() => String)
  workAuthorizations: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBoolean()
  needsSponsorship: boolean | null;

  @ApiProperty({ enum: WORK_MODES, isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsIn(WORK_MODES, { each: true })
  acceptableWorkModes: WorkMode[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  travelTolerance: string | null;

  @ApiProperty()
  @IsBoolean()
  useInferredCollaborationHours: boolean;
}
