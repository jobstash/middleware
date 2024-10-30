import { ApiProperty, ApiPropertyOptional, OmitType } from "@nestjs/swagger";
import { CreateProjectInput } from "./create-project.input";
import { IsArray, IsOptional, IsString } from "class-validator";
import { UpsertDetectedJobsites } from "./upsert-detected-jobsites.input";
import { UpdateProjectJobsitesInput } from "./update-project-jobsites.input";

export class UpdateProjectInput extends OmitType(CreateProjectInput, [
  "orgId",
  "description",
]) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description: string | null;

  @ApiProperty()
  @IsOptional()
  @IsArray()
  jobsites: UpdateProjectJobsitesInput["jobsites"];

  @ApiProperty()
  @IsOptional()
  @IsArray()
  detectedJobsites: UpsertDetectedJobsites[];
}
