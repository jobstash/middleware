import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class FundingRound {
  public static readonly FundingRoundType = t.strict({
    id: t.string,
    date: t.number,
    createdTimestamp: t.number,
    roundName: t.union([t.string, t.null]),
    sourceLink: t.union([t.string, t.null]),
    raisedAmount: t.union([t.number, t.null]),
  });
  @ApiProperty()
  id: string;

  @ApiProperty()
  raisedAmount: number;

  @ApiPropertyOptional()
  roundName: string | null;

  @ApiProperty()
  date: number;

  @ApiPropertyOptional()
  sourceLink: string | null;

  @ApiProperty()
  createdTimestamp: number;

  constructor(raw: FundingRound) {
    const { id, raisedAmount, roundName, date, sourceLink, createdTimestamp } =
      raw;

    const result = FundingRound.FundingRoundType.decode(raw);

    this.id = id;
    this.date = date;
    this.roundName = roundName;
    this.sourceLink = sourceLink;
    this.raisedAmount = raisedAmount;
    this.createdTimestamp = createdTimestamp;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `funding round instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
