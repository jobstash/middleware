import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsString } from "class-validator";
import { UpsertDetectedJobsites } from "./upsert-detected-jobsites.input";

export class UpdateOrgJobsitesInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  orgId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  jobsites: UpsertDetectedJobsites[];
}
