import { ApiProperty } from "@nestjs/swagger";
import {
  IsArray,
  IsEthereumAddress,
  IsNotEmpty,
  IsString,
} from "class-validator";

export class CreatePairedTermsInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  originTerm: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  pairedTermList: string[];

  @ApiProperty()
  @IsNotEmpty()
  @IsEthereumAddress()
  creatorWallet: string;
}
