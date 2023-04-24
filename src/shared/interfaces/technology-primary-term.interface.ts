import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsEthereumAddress } from "class-validator";

export class PreferredTechnologyTerm {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  technologyName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  preferredName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsEthereumAddress()
  creatorWallet: string;
}
