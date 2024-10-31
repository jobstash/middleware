import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsString } from "class-validator";

export class UpsertDetectedJobsites {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
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
