import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class GithubProfile {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  github_login: string;

  @IsNumber()
  @ApiProperty()
  github_id: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  github_node_id: string;

  @IsString()
  @ApiPropertyOptional()
  github_gravatar_id?: string;

  @IsString()
  @ApiProperty()
  github_avatar_url: string;
}
