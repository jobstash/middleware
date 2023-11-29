import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class ChangeJobProjectInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  shortUUID: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  projectId: string;
}
