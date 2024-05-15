import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateOrgDetectedJobsitesInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  orgId: string;

  @ApiProperty()
  @IsOptional()
  @IsArray()
  detectedJobsites: {
    id: string | null;
    url: string;
    type: string;
  }[];
}
