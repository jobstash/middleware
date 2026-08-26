import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export const RECORDABLE_JOB_ACTIVITY_TYPES = [
  "job_impression",
  "job_view",
  "job_dismiss",
] as const;

export type RecordableJobActivityType =
  (typeof RECORDABLE_JOB_ACTIVITY_TYPES)[number];

export class RecordJobActivityInput {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  shortUUID: string;

  @ApiProperty({ enum: RECORDABLE_JOB_ACTIVITY_TYPES })
  @IsIn(RECORDABLE_JOB_ACTIVITY_TYPES)
  eventType: RecordableJobActivityType;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  eventId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  surface?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  dwellMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
