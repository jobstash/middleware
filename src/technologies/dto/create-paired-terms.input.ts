import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsString } from "class-validator";

export class CreatePairedTermsInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  originTerm: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  pairedTermList: string[];
}
