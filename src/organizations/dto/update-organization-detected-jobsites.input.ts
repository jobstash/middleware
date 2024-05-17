import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { UpdateDetectedJobsites } from "./update-detected-jobsites.input";

export class UpdateOrgDetectedJobsitesInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  orgId: string;

  @ApiProperty()
  @IsOptional()
  @IsArray()
  detectedJobsites: UpdateDetectedJobsites[];
}
