import { IsNotEmpty, IsIn, IsString, IsEthereumAddress } from "class-validator";

import { USER_ROLES, USER_FLOWS } from "src/shared/constants";
const userFlows = Object.values(USER_FLOWS);

export class AssignRoleAndFlowToUserRequestDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  wallet: string;

  @IsNotEmpty()
  @IsIn([USER_ROLES.DEV, USER_ROLES.ORG, USER_ROLES.ADMIN])
  @IsString()
  role: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(userFlows)
  flow: string;
}
