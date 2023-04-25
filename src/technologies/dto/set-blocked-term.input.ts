import { ApiProperty } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsString,
  IsEthereumAddress,
  IsArray,
} from "class-validator";
export class BlockedTermsInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  technologyNameList: string[];

  @ApiProperty()
  @IsNotEmpty()
  @IsEthereumAddress()
  creatorWallet: string;
}
