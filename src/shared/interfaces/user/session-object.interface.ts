import { ApiProperty } from "@nestjs/swagger";

export class SessionObject {
  @ApiProperty()
  address?: string;
  @ApiProperty()
  role: string | null;
  @ApiProperty()
  flow: string | null;
  @ApiProperty()
  cryptoNative: boolean;
}
