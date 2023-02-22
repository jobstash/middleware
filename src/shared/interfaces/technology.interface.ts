import { ApiProperty } from "@nestjs/swagger";

export class Technology {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
}
