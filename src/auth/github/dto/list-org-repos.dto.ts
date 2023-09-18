import { IsEthereumAddress, IsNotEmpty, IsString } from "class-validator";

export class ListOrgReposDto {
  @IsNotEmpty()
  @IsString()
  orgName: string;

  @IsNotEmpty()
  @IsString()
  orgAuthToken: string;

  @IsNotEmpty()
  @IsEthereumAddress()
  requestorWallet: string;
}
