import { IsEthereumAddress, IsNotEmpty, IsString } from "class-validator";

export class ApproveOrgInput {
  @IsNotEmpty()
  @IsString()
  @IsEthereumAddress()
  wallet: string;
}
