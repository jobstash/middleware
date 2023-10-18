import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty } from "class-validator";

export class UpdateUserWorksInput {
  @ApiProperty()
  @IsArray()
  @IsNotEmpty()
  works: { label: string; url: string }[];
}
