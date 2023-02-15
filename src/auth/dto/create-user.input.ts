import { GithubProfile } from "src/shared/types";
import { IsDefined, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { Type } from "class-transformer";

export class CreateUserInput {
  @IsString()
  @IsDefined()
  @IsNotEmpty()
  accessToken: string;

  @IsString()
  @IsOptional()
  refreshToken: string;

  @Type(() => GithubProfile)
  profile: GithubProfile;
}
