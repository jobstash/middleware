import { IsOptional, IsString, IsUrl } from "class-validator";

export class CreateGithubUserDto {
  @IsOptional()
  @IsString()
  login: string;

  @IsOptional()
  @IsUrl()
  avatarUrl: string;
}
