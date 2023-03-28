import { ApiProperty } from "@nestjs/swagger";
import { IsEthereumAddress, IsIn, IsString } from "class-validator";

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
  @IsIn(["dev", "org"])
  role: string;
}
