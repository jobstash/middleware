import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class CreatePreferredTermInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  preferredName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  technologyName: string;
}
