import { IsNotEmpty, IsString } from "class-validator";

export class AcceptDelegateAccessInput {
  @IsString()
  @IsNotEmpty()
  toOrgId: string;

  @IsString()
  @IsNotEmpty()
  authToken: string;
}
