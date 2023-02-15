import { ApiResponseProperty } from "@nestjs/swagger";

export class PaginatedData<T extends object> {
  @ApiResponseProperty()
  page: number;
  @ApiResponseProperty()
  count: number;
  @ApiResponseProperty()
  data: T[];

  constructor(page: number, data: T[]) {
    return {
      page: page,
      count: data.length,
      data: data,
    };
  }
}
