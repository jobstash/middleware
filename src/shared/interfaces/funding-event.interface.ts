import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class FundingEvent {
  public static readonly FundingEventType = t.strict({
    id: t.string,
    timestamp: t.number,
    amountInUsd: t.number,
    tokenAmount: t.number,
    tokenUnit: t.string,
    roundName: t.string,
    sourceLink: t.union([t.string, t.null]),
    eventType: t.union([t.literal("grant"), t.literal("round")]),
  });

  id: string;
  timestamp: number;
  amountInUsd: number;
  tokenAmount: number;
  tokenUnit: string;
  roundName: string;
  sourceLink: string | null;
  eventType: "grant" | "round";

  constructor(raw: FundingEvent) {
    const {
      id,
      timestamp,
      amountInUsd,
      tokenAmount,
      tokenUnit,
      roundName,
      sourceLink,
      eventType,
    } = raw;
    this.id = id;
    this.timestamp = timestamp;
    this.amountInUsd = amountInUsd;
    this.tokenAmount = tokenAmount;
    this.tokenUnit = tokenUnit;
    this.roundName = roundName;
    this.sourceLink = sourceLink;
    this.eventType = eventType;

    const result = FundingEvent.FundingEventType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `funding event instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
