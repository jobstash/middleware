import { IsNotEmpty, IsString } from "class-validator";

export class DelegateAccessInput {
  @IsString()
  @IsNotEmpty()
  toOrgId: string;
}
