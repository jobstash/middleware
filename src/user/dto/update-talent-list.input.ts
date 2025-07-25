import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsEthereumAddress, IsNotEmpty } from "class-validator";

export class UpdateTalentListInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  @IsEthereumAddress({ each: true })
  wallets: string[];
}
