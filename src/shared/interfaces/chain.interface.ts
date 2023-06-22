import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
// import { isLeft } from "fp-ts/lib/Either";

export class Chain {
  public static readonly ChainType = t.strict({
    id: t.string,
    name: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  // constructor(raw: Chain) {
  //   const { id, name } = raw;
  //   const result = Chain.ChainType.decode(raw);

  //   this.id = id;
  //   this.name = name;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing Chain! Constructor expected: \n {
  //         id: string,
  //         name: string,
  //       }
  //       got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}
