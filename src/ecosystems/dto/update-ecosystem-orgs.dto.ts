import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class UpdateEcosystemOrgsDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  orgIds: string[];
}
