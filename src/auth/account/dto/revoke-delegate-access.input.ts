import { IsNotEmpty, IsString } from "class-validator";

export class RevokeDelegateAccessInput {
  @IsString()
  @IsNotEmpty()
  toOrgId: string;

  @IsString()
  @IsNotEmpty()
  fromOrgId: string;
}
