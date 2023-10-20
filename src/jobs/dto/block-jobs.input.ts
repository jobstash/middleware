import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty } from "class-validator";

export class BlockJobsInput {
  @ApiProperty()
  @IsArray()
  @IsNotEmpty()
  shortUUIDs: string[];
}
