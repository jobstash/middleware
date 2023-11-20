import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class ChangeJobLocationTypeInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  shortUUID: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  locationType: string;
}
