import { ApiProperty } from "@nestjs/swagger";

export class PaginatedData<T> {
  @ApiProperty()
  page: number;
  @ApiProperty()
  count: number;
  @ApiProperty()
  data: T[];
}
