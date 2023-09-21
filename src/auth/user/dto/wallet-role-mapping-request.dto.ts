import { IsNotEmpty, IsEthereumAddress, IsString, IsIn } from "class-validator";
import { USER_ROLES } from "src/shared/constants";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { ADMIN, ANON, ...userRoles } = USER_ROLES;

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
