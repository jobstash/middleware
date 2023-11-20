import { IsNotEmpty, IsEthereumAddress } from "class-validator";

export class WalletAdminMappingDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  wallet: string;
}
