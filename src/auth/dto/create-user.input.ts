import { GithubProfile } from "src/shared/types";
import { IsDefined, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { PartialType } from "@nestjs/mapped-types";

export class CreateUserInput extends PartialType(GithubProfile) {
  @IsString()
  @IsDefined()
  @IsNotEmpty()
  github_access_token: string;

  @IsString()
  @IsOptional()
  github_refresh_token?: string | undefined;
}
