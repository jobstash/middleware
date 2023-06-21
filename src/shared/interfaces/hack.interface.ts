import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class Hack {
  public static readonly HackType = t.strict({
    id: t.string,
    defiId: t.string,
    category: t.string,
    fundsLost: t.number,
    issueType: t.string,
    description: t.string,
    date: t.union([t.string, t.null]),
    fundsReturned: t.union([t.number, t.null]),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  date: string;

  @ApiProperty()
  defiId: string;

  @ApiProperty()
  category: number;

  @ApiProperty()
  fundsLost: number;

  @ApiProperty()
  issueType: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  fundsReturned: number;

  constructor(raw: Hack) {
    const {
      id,
      date,
      defiId,
      category,
      fundsLost,
      issueType,
      description,
      fundsReturned,
    } = raw;
    const result = Hack.HackType.decode(raw);

    this.id = id;
    this.date = date;
    this.defiId = defiId;
    this.category = category;
    this.fundsLost = fundsLost;
    this.issueType = issueType;
    this.description = description;
    this.fundsReturned = fundsReturned;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
