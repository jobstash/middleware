import { ApiProperty } from "@nestjs/swagger";
import {
  IsEthereumAddress,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";

export class GithubInfo {
  @ApiProperty()
  @IsString()
  @IsEthereumAddress()
  wallet: string;

  @ApiProperty()
  @IsString()
  githubAccessToken: string;

  @ApiProperty()
  @IsString()
  githubRefreshToken: string;

  @ApiProperty()
  @IsString()
  githubLogin: string;

  @ApiProperty()
  @IsNumber()
  githubId: string;

  @ApiProperty()
  @IsString()
  githubNodeId: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  githubGravatarId?: string | undefined;

  @ApiProperty()
  @IsString()
  githubAvatarUrl: string;
}
