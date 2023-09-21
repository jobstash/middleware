import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
// import { isLeft } from "fp-ts/lib/Either";
import { ApiProperty } from "@nestjs/swagger";

export class BlockedTerm {
  public static readonly BlockedTermType = t.strict({
    id: t.string,
    status: t.boolean,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  status: boolean;

  // constructor(raw: BlockedTerm) {
  //   const { id, status } = raw;
  //   const result = BlockedTerm.BlockedTermType.decode(raw);

  //   this.id = id;
  //   this.status = status;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing BlockedTerm! Constructor expected: \n {
  //         id: string,
  //         status: boolean,
  //       } got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}
