import { ApiProperty } from "@nestjs/swagger";

export class Investor {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
}
