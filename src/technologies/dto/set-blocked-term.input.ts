import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsEthereumAddress } from "class-validator";
export class BlockedTermsInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  technologyNameList: string[];

  @ApiProperty()
  @IsNotEmpty()
  @IsEthereumAddress()
  creatorWallet: string;
}
