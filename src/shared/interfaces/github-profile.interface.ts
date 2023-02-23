import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class GithubProfile {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  githubLogin: string;

  @IsNumber()
  @ApiProperty()
  githubId: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  githubNodeId: string;

  @IsString()
  @ApiPropertyOptional()
  githubGravatarId?: string;

  @IsString()
  @ApiProperty()
  githubAvatarUrl: string;
}
