import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsString } from "class-validator";

export class CreatePairedTagsInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  originTag: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  pairedTagList: string[];
}
