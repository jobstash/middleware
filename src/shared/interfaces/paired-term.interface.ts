import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
// import { isLeft } from "fp-ts/lib/Either";

export class PairedTerm {
  public static readonly PairedTermType = t.strict({
    technology: t.string,
    pairings: t.array(t.string),
  });

  @ApiProperty()
  technology: string;

  @ApiProperty()
  pairings: string[];

  // constructor(raw: PairedTerm) {
  //   const { technology, pairings } = raw;
  //   const result = PairedTerm.PairedTermType.decode(raw);

  //   this.technology = technology;
  //   this.pairings = pairings;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing PairedTerm! Constructor expected: \n {
  //         technology: string,
  //         pairings: string[],
  //       } got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}
