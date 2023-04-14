import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsEthereumAddress } from "class-validator";
export class SetBlockedTermInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  technologyName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsEthereumAddress()
  creatorWallet: string;
}
