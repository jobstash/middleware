import { ApiProperty } from "@nestjs/swagger";
import { IsEthereumAddress, IsNumber, IsString } from "class-validator";

export class GithubInfo {
  @ApiProperty()
  @IsString()
  @IsEthereumAddress()
  wallet: string;

  @ApiProperty()
  @IsString()
  githubLogin: string;

  @ApiProperty()
  @IsNumber()
  githubId: string;

  @ApiProperty()
  @IsString()
  githubAvatarUrl: string;
}
