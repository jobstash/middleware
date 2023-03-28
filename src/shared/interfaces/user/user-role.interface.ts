import { ApiProperty } from "@nestjs/swagger";

export class UserRole {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
}
