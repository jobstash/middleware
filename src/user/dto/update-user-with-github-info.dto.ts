import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsUrl,
  IsEthereumAddress,
} from "class-validator";

export class UpdateUserWithGithubInfoDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  wallet: string;

  @IsNotEmpty()
  @IsString()
  githubLogin: string;

  @IsNotEmpty()
  @IsNumber()
  githubId: number;

  @IsNotEmpty()
  @IsString()
  githubNodeId: string;

  @IsOptional()
  @IsString()
  githubGravatarId?: string;

  @IsOptional()
  @IsUrl()
  githubAvatarUrl?: string;

  @IsNotEmpty()
  @IsString()
  githubAccessToken: string;

  @IsOptional()
  @IsString()
  githubRefreshToken?: string;
}
