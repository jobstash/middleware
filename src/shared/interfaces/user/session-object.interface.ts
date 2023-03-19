import { ApiProperty } from "@nestjs/swagger";

export class SessionObject {
  @ApiProperty()
  address: string;
  @ApiProperty()
  chainId: number;
}
