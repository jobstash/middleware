import { IsNotEmpty, IsString } from "class-validator";

export class AcceptDelegateAccessInput {
  @IsString()
  @IsNotEmpty()
  fromOrgId: string;

  @IsString()
  @IsNotEmpty()
  toOrgId: string;

  @IsString()
  @IsNotEmpty()
  authToken: string;
}
