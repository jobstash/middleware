import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsUrl,
  IsIn,
  IsEthereumAddress,
} from "class-validator";
import { USER_ROLES } from "src/shared/constants";

export class UpdateUserWithGithubInfoDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  wallet: string;

  @IsNotEmpty()
  @IsString()
  @IsIn([USER_ROLES.DEV, USER_ROLES.ORG])
  role: string;

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
