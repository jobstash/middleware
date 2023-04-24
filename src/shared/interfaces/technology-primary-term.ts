import { IsNotEmpty, IsString, IsEthereumAddress } from "class-validator";

export class PreferredTechnologyTermDto {
  @IsNotEmpty()
  @IsString()
  technologyName: string;

  @IsNotEmpty()
  @IsString()
  preferredName: string;

  @IsNotEmpty()
  @IsEthereumAddress()
  creatorWallet: string;
}
