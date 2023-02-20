import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class GithubProfile {
  @IsString()
  @IsNotEmpty()
  login: string;

  @IsNumber()
  id: number;

  @IsString()
  @IsNotEmpty()
  node_id: string;

  @IsString()
  @IsNotEmpty()
  gravatar_id: string;

  @IsString()
  avatar_url: string;
}
