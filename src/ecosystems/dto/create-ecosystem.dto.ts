import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class CreateEcosystemDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;
}
