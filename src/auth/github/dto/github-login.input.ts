import { ApiProperty } from "@nestjs/swagger";
import { IsEthereumAddress, IsIn, IsString } from "class-validator";
import { CheckWalletRoles } from "src/shared/constants";
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
}
