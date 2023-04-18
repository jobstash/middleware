import { ApiProperty } from "@nestjs/swagger";
import { IsEthereumAddress, IsNotEmpty, IsString } from "class-validator";

export class CreatePreferredTermInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  preferredName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  technologyName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @IsEthereumAddress()
  creatorWallet: string;
}
