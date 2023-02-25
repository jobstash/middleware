import { ApiProperty } from "@nestjs/swagger";

export class Hack {
  @ApiProperty()
  id: string;
  @ApiProperty()
  date: number;
  @ApiProperty()
  classification: string;
  @ApiProperty()
  fundsLost: number;
  @ApiProperty()
  link: string;
}
