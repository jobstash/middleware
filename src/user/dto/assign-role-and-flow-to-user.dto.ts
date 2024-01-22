import { IsNotEmpty, IsIn, IsString, IsEthereumAddress } from "class-validator";

import { CheckWalletRoles, CheckWalletFlows } from "src/shared/constants";
const userFlows = Object.values(CheckWalletFlows);

export class AssignRoleAndFlowToUserRequestDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  wallet: string;

  @IsNotEmpty()
  @IsIn([CheckWalletRoles.DEV, CheckWalletRoles.ORG, CheckWalletRoles.ADMIN])
  @IsString()
  role: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(userFlows)
  flow: string;
}
