import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsString } from "class-validator";

export class ChangeJobClassificationInput {
  @ApiProperty()
  @IsArray()
  @IsNotEmpty()
  shortUUIDs: string[];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  classification: string;
}
