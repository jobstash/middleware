import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class VerifyMessageDto {
  @ApiProperty()
  @IsString()
  message: string;

  @IsString()
  @ApiProperty()
  signature: string;
}
