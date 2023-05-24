import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
import { Technology } from "./technology.interface";
// import { isLeft } from "fp-ts/lib/Either";

export class TechnologyPreferredTerm extends Technology {
  public static readonly TechnologyPreferredTermType = t.strict({
    technology: Technology.TechnologyType,
    synonyms: t.array(Technology.TechnologyType),
  });

  @ApiProperty()
  technology: Technology;
  @ApiProperty()
  synonyms: Technology[];

  // constructor(raw: TechnologyPreferredTerm) {
  //   super(raw);

  //   const { technology, synonyms } = raw;
  //   const result =
  //     TechnologyPreferredTerm.TechnologyPreferredTermType.decode(raw);

  //   this.technology = technology;
  //   this.synonyms = synonyms;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing TechnologyPreferredTerm! Constructor expected: \n {
  //         technology: Technology,
  //         synonyms: Technology[],
  //       } got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}
