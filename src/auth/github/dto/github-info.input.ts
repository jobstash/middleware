import { ApiProperty } from "@nestjs/swagger";
import { IsEthereumAddress, IsString } from "class-validator";

export class GithubInfo {
  @ApiProperty()
  @IsString()
  @IsEthereumAddress()
  wallet: string;

  @ApiProperty()
  @IsString()
  githubLogin: string;

  @ApiProperty()
  @IsString()
  githubAvatarUrl: string;
}
