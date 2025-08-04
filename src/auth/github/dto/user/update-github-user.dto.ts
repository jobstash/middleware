import { IsOptional, IsString, IsUrl } from "class-validator";

export class UpdateGithubUserDto {
  @IsOptional()
  @IsString()
  login?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}
