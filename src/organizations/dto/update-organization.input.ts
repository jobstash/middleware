import { ApiProperty, ApiPropertyOptional, OmitType } from "@nestjs/swagger";
import { CreateOrganizationInput } from "./create-organization.input";
import { IsArray, IsOptional } from "class-validator";
import { UpdateJobsites } from "./update-jobsites.input";
import { UpsertDetectedJobsites } from "./upsert-detected-jobsites.input";

export class UpdateOrganizationInput extends OmitType(CreateOrganizationInput, [
  "orgId",
] as const) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  grants: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  projects: string[];

  @ApiProperty()
  @IsOptional()
  @IsArray()
  communities: string[];

  @ApiProperty()
  @IsOptional()
  @IsArray()
  jobsites: UpdateJobsites[];

  @ApiProperty()
  @IsOptional()
  @IsArray()
  detectedJobsites: UpsertDetectedJobsites[];
}
