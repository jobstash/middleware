import { IsEthereumAddress, IsNotEmpty, IsString } from "class-validator";

export class ListDevReposDto {
  @IsNotEmpty()
  @IsString()
  devAuthToken: string;

  @IsNotEmpty()
  @IsEthereumAddress()
  requestorWallet: string;
}
