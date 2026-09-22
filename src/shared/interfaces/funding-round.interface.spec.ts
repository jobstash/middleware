import { FundingEvent } from "./funding-event.interface";
import {
  FundingRound,
  fundingRoundToFundingEvent,
} from "./funding-round.interface";

const round = {
  id: "undated-round",
  date: null,
  createdTimestamp: 1750000000000,
  updatedTimestamp: null,
  roundName: "Seed",
  sourceLink: null,
  raisedAmount: 1000000,
};

describe("funding rounds with unknown dates", () => {
  it("accepts an undated round in the shared response validator", () => {
    expect(new FundingRound(round).date).toBeNull();
    expect(FundingRound.FundingRoundType.is(round)).toBe(true);
  });

  it("retains unknown dates when converting to funding events", () => {
    const event = new FundingEvent(
      fundingRoundToFundingEvent(new FundingRound(round)),
    );
    expect(event.timestamp).toBeNull();
  });

  it("preserves known dates and continues rejecting invalid values", () => {
    expect(new FundingRound({ ...round, date: 1700000000000 }).date).toBe(
      1700000000000,
    );
    expect(
      FundingRound.FundingRoundType.is({ ...round, date: "unknown" }),
    ).toBe(false);
  });
});
