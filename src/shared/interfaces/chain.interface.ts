import { ApiProperty } from "@nestjs/swagger";

export class Chain {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
}
