// import { ApiProperty } from "@nestjs/swagger";

// export class PaginatedData<T> {
//   @ApiProperty()
//   page: number;
//   @ApiProperty()
//   count: number;
//   @ApiProperty()
//   total: number;
//   @ApiProperty()
//   data: T[];
// }

import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
// import { isLeft } from "fp-ts/lib/Either";

export class PaginatedData<T> {
  public static readonly PaginatedDataType = <T>(
    type: t.Type<T>,
  ): t.Type<PaginatedData<T>> =>
    t.strict({
      page: t.number,
      count: t.number,
      total: t.number,
      data: t.array(type),
    });

  @ApiProperty()
  page: number;

  @ApiProperty()
  count: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  data: T[];

  // constructor(raw: PaginatedData<T>) {
  //   const { page, count, total, data } = raw;
  //   const result = PaginatedData.PaginatedDataType(t.unknown).decode(raw);

  //   this.page = page;
  //   this.count = count;
  //   this.total = total;
  //   this.data = data;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing PaginatedData! Constructor expected: \n {
  //         page: number,
  //         count: number,
  //         total: number,
  //         data: ${inferObjectType(data)},
  //       } got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}
