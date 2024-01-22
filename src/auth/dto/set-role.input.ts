import { ApiProperty } from "@nestjs/swagger";
import { IsEthereumAddress, IsIn, IsString } from "class-validator";

import { CheckWalletRoles } from "src/shared/constants/check-wallet-result";

export class SetRoleInput {
  @ApiProperty()
  @IsEthereumAddress()
  wallet: string;

  @ApiProperty()
  @IsString()
  @IsIn([CheckWalletRoles.DEV, CheckWalletRoles.ORG])
  role: string;
}
