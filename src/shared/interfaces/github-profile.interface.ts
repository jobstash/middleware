import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class GithubProfile {
  @IsString()
  @IsNotEmpty()
  github_login: string;

  @IsNumber()
  github_id: number;

  @IsString()
  @IsNotEmpty()
  github_node_id: string;

  @IsString()
  github_gravatar_id?: string;

  @IsString()
  github_avatar_url: string;
}
