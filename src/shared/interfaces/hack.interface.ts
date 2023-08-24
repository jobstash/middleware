import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class Hack {
  public static readonly HackType = t.strict({
    id: t.union([t.string, t.null]),
    defiId: t.union([t.string, t.null]),
    category: t.union([t.string, t.null]),
    fundsLost: t.union([t.number, t.null]),
    issueType: t.union([t.string, t.null]),
    date: t.union([t.number, t.null]),
    description: t.union([t.union([t.string, t.null]), t.null]),
    fundsReturned: t.union([t.number, t.null]),
  });

  @ApiProperty()
  id: string | null;

  @ApiProperty()
  date: string | null;

  @ApiProperty()
  defiId: string | null;

  @ApiProperty()
  category: number | null;

  @ApiProperty()
  fundsLost: number | null;

  @ApiProperty()
  issueType: string | null;

  @ApiProperty()
  description: string | null;

  @ApiProperty()
  fundsReturned: number | null;

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
