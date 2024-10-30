import { ApiProperty } from "@nestjs/swagger";
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { UpsertDetectedJobsites } from "./upsert-detected-jobsites.input";

export class UpdateProjectDetectedJobsitesInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsOptional()
  @IsArray()
  detectedJobsites: UpsertDetectedJobsites[];
}
