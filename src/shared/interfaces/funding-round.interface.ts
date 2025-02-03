import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { FundingEvent } from "./funding-event.interface";

export class FundingRound {
  public static readonly FundingRoundType = t.strict({
    id: t.string,
    date: t.number,
    createdTimestamp: t.number,
    roundName: t.union([t.string, t.null]),
    sourceLink: t.union([t.string, t.null]),
    raisedAmount: t.union([t.number, t.null]),
    updatedTimestamp: t.union([t.number, t.null]),
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

  @ApiProperty()
  updatedTimestamp: number | null;

  constructor(raw: FundingRound) {
    const {
      id,
      raisedAmount,
      roundName,
      date,
      sourceLink,
      createdTimestamp,
      updatedTimestamp,
    } = raw;

    const result = FundingRound.FundingRoundType.decode(raw);

    this.id = id;
    this.date = date;
    this.roundName = roundName;
    this.sourceLink = sourceLink;
    this.raisedAmount = raisedAmount;
    this.createdTimestamp = createdTimestamp;
    this.updatedTimestamp = updatedTimestamp;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `funding round instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export const fundingRoundToFundingEvent = (x: FundingRound): FundingEvent => {
  return {
    id: x.id,
    timestamp: new Date(x.date).getTime(),
    amountInUsd: x.raisedAmount,
    tokenAmount: x.raisedAmount,
    tokenUnit: "USD",
    roundName: x.roundName,
    sourceLink: x.sourceLink,
    eventType: "round",
  };
};
