import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDivisibleBy,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";
import { WORK_MODES, WorkMode } from "src/shared/interfaces";

export class UpdateJobPreferencesInput {
  @ApiProperty({ enum: WORK_MODES, isArray: true })
  @IsArray()
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
  @IsString()
  attendancePreference: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  travelTolerance: string | null;
}
