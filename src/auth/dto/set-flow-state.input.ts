import { ApiProperty } from "@nestjs/swagger";
import { IsEthereumAddress, IsString } from "class-validator";

export class SetFlowStateInput {
  @ApiProperty()
  @IsEthereumAddress()
  wallet: string;

  @IsString()
  @ApiProperty()
  flow: string;
}
