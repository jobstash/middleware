import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class SendVerificationEmailInput {
  @ApiProperty()
  @IsString()
  @IsEmail()
  @IsNotEmpty()
  destination: string;
}
