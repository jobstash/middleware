import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsString, IsUUID } from "class-validator";
import { CreateProjectJobsiteInput } from "./create-project-jobsites.input";

export class UpdateProjectJobsitesInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  jobsites: CreateProjectJobsiteInput[];
}
