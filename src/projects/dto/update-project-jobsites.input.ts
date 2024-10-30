import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsString, IsUUID } from "class-validator";

export class UpdateProjectJobsitesInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  jobsites: {
    id: string;
    url: string;
    type: string;
  }[];
}
