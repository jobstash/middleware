import { IsOptional, IsString, IsUrl } from "class-validator";

export class CreateGithubUserDto {
  @IsOptional()
  @IsString()
  login: string;

  @IsOptional()
  @IsString()
  nodeId: string;

  @IsOptional()
  @IsString()
  gravatarId?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl: string;

  @IsOptional()
  @IsString()
  id: string;
}
