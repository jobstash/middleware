import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsEthereumAddress } from "class-validator";

export class UpdateTalentListInput {
  @ApiProperty()
  @IsArray()
  @IsEthereumAddress({ each: true })
  wallets: string[];
}
