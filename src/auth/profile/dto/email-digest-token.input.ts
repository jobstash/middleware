import { IsString, MinLength } from "class-validator";

export class EmailDigestTokenInput {
  @IsString()
  @MinLength(32)
  token: string;
}
