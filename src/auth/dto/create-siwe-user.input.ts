import { ApiProperty } from "@nestjs/swagger";
import { IsEthereumAddress, IsNumber, IsString } from "class-validator";

export class CreateSIWEUserInput {
  @ApiProperty()
  @IsString()
  @IsEthereumAddress()
  wallet: string;

  @ApiProperty()
  @IsNumber()
  chainId: number;
}
