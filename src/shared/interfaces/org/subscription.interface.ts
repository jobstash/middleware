import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class Subscription {
  public static readonly SubscriptionType = t.strict({
    id: t.string,
    tier: t.string,
    veri: t.string,
    stashAlert: t.boolean,
    extraSeats: t.number,
    status: t.intersection([
      t.literal("active"),
      t.literal("inactive"),
      t.literal("expired"),
    ]),
    duration: t.intersection([t.literal("monthly"), t.literal("yearly")]),
    createdTimestamp: t.number,
    expiryTimestamp: t.number,
    quota: t.strict({
      veri: t.number,
      seats: t.number,
      stashPool: t.boolean,
      stashAlert: t.boolean,
      atsIntegration: t.boolean,
      boostedVacancyMultiplier: t.number,
    }),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  tier: string;

  @ApiProperty()
  veri: string;

  @ApiProperty()
  stashAlert: boolean;

  @ApiProperty()
  extraSeats: number;

  @ApiProperty()
  status: "active" | "inactive" | "expired";

  @ApiProperty()
  duration: "monthly" | "yearly";

  @ApiProperty()
  createdTimestamp: number;

  @ApiProperty()
  expiryTimestamp: number;

  @ApiProperty()
  quota: {
    seats: number;
    veri: number;
    stashPool: boolean;
    atsIntegration: boolean;
    boostedVacancyMultiplier: number;
    stashAlert: boolean;
  };

  constructor(raw: Subscription) {
    const {
      id,
      tier,
      veri,
      stashAlert,
      extraSeats,
      status,
      duration,
      createdTimestamp,
      quota,
    } = raw;
    const result = Subscription.SubscriptionType.decode(raw);

    this.id = id;
    this.tier = tier;
    this.veri = veri;
    this.stashAlert = stashAlert;
    this.extraSeats = extraSeats;
    this.status = status;
    this.duration = duration;
    this.createdTimestamp = createdTimestamp;
    this.quota = quota;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `subscription instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
