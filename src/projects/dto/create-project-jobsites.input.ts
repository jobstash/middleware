import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsString, IsUUID } from "class-validator";

export class CreateProjectJobsiteInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  url: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @IsIn([
    "greenhouse",
    "lever",
    "workable",
    "custom",
    "hirechain",
    "wellfound",
    "onepage",
  ])
  type:
    | "greenhouse"
    | "lever"
    | "workable"
    | "custom"
    | "hirechain"
    | "onepage"
    | "wellfound";
}
