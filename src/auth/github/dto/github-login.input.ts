import { ApiProperty } from "@nestjs/swagger";
import {
  IsEthereumAddress,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";
import { CheckWalletRoles } from "src/shared/enums";
export class GithubLoginInput {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  @IsEthereumAddress()
  wallet: string;

  @ApiProperty()
  @IsString()
  @IsIn([CheckWalletRoles.DEV, CheckWalletRoles.ORG])
  role: string;

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
  githubId: number;

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
