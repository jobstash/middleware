import { ApiProperty } from "@nestjs/swagger";

export class UserFlow {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
}
