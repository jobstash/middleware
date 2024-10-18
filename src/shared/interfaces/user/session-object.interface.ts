import { ApiProperty } from "@nestjs/swagger";

export class SessionObject {
  @ApiProperty()
  address?: string;
  @ApiProperty()
  permissions: string[];
  @ApiProperty()
  cryptoNative: boolean;
}
