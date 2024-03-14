import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsIn, IsNotEmpty, IsString } from "class-validator";

export class UpdateOrgJobApplicantListInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @IsIn(["shortlisted", "archived"] as const)
  list: string;

  @ApiProperty()
  @IsArray()
  applicants: string[];
}
