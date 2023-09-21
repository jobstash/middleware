import { IsNotEmpty, IsEthereumAddress, IsString, IsIn } from "class-validator";
import { USER_FLOWS } from "src/shared/constants";

const flows = Object.values(USER_FLOWS);

export class WalletFlowMappingDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  wallet: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(flows)
  flow: string;
}
