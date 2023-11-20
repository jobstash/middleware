import { IsNotEmpty, IsEthereumAddress } from "class-validator";

export class CreateUserFromWalletSignatureRequestDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  wallet: string;
}
