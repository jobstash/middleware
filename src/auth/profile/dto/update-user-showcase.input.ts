import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty } from "class-validator";

export class UpdateUserShowCaseInput {
  @ApiProperty()
  @IsArray()
  @IsNotEmpty()
  showcase: { label: string; url: string }[];
}
