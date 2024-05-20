import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsIn, IsNotEmpty, IsString } from "class-validator";

export class UpdateJobApplicantListInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @IsIn(["shortlisted", "archived"] as const)
  list: string;

  @ApiProperty()
  @IsArray()
  applicants: { wallet: string; job: string }[];
}
