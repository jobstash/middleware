import { ApiProperty } from "@nestjs/swagger";

export class ProjectCategory {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
}
