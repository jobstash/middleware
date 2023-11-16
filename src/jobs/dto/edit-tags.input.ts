import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsString } from "class-validator";

export class EditJobTagsInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  shortUUID: string;

  @ApiProperty()
  @IsArray()
  @IsNotEmpty()
  tags: string[];
}
