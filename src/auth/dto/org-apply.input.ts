import { IsNotEmpty, IsEmail, IsString } from "class-validator";

export class OrgApplyInput {
  @IsNotEmpty()
  @IsString()
  @IsEmail()
  email: string;
}
