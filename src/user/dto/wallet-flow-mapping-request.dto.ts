import { IsNotEmpty, IsEthereumAddress, IsString, IsIn } from "class-validator";
import { CheckWalletFlows } from "src/shared/constants";

const flows = Object.values(CheckWalletFlows);

export class WalletFlowMappingDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  wallet: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(flows)
  flow: string;
}
