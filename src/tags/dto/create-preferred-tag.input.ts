import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsString } from "class-validator";

export class CreatePreferredTagInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  preferredName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  synonyms: string[];
}
