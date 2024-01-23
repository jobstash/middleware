import { IsNotEmpty, IsEthereumAddress, IsString, IsIn } from "class-validator";
import { CheckWalletRoles } from "src/shared/constants";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { ADMIN, ANON, ...userRoles } = CheckWalletRoles;

const userRolesArray = Object.values(userRoles);

export class WalletRoleMappingDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  wallet: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(userRolesArray)
  role: string;
}
