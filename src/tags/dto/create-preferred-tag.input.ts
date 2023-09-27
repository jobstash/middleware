import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class CreatePreferredTagInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  preferredName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tagName: string;
}
