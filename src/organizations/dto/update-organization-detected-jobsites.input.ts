import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { UpsertDetectedJobsites } from "./upsert-detected-jobsites.input";

export class UpdateOrgDetectedJobsitesInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  orgId: string;

  @ApiProperty()
  @IsOptional()
  @IsArray()
  detectedJobsites: UpsertDetectedJobsites[];
}
