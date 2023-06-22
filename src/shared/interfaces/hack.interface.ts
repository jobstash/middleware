import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
// import { inferObjectType } from "../helpers";
// import { isLeft } from "fp-ts/lib/Either";

export class Hack {
  public static readonly HackType = t.strict({
    id: t.string,
    date: t.number,
    link: t.string,
    fundsLost: t.number,
    classification: t.string,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  date: number;

  @ApiProperty()
  classification: string;

  @ApiProperty()
  fundsLost: number;

  @ApiProperty()
  link: string;

  // constructor(raw: Hack) {
  //   const { id, date, classification, fundsLost, link } = raw;
  //   const result = Hack.HackType.decode(raw);

  //   this.id = id;
  //   this.date = date;
  //   this.link = link;
  //   this.fundsLost = fundsLost;
  //   this.classification = classification;

  //   if (isLeft(result)) {
  //     throw new Error(
  //       `Error Serializing Hack! Constructor expected: \n {
  //         id: string,
  //         date: number,
  //         link: string,
  //         fundsLost: number,
  //         classification: string,
  //       }
  //       got ${inferObjectType(raw)}`,
  //     );
  //   }
  // }
}
