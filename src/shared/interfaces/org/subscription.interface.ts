import { ApiProperty } from "@nestjs/swagger";
import { subMonths } from "date-fns";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { now } from "lodash";

export class Subscription {
  public static readonly SubscriptionType = t.strict({
    id: t.string,
    tier: t.union([
      t.literal("starter"),
      t.literal("growth"),
      t.literal("pro"),
      t.literal("max"),
    ]),
    veri: t.union([
      t.literal("lite"),
      t.literal("plus"),
      t.literal("elite"),
      t.literal("ultra"),
      t.null,
    ]),
    stashPool: t.boolean,
    stashAlert: t.boolean,
    atsIntegration: t.boolean,
    boostedVacancyMultiplier: t.number,
    extraSeats: t.number,
    status: t.union([t.literal("active"), t.literal("inactive")]),
    expired: t.boolean,
    duration: t.union([t.literal("monthly"), t.literal("yearly")]),
    createdTimestamp: t.number,
    expiryTimestamp: t.number,
    quota: t.strict({
      veri: t.number,
      seats: t.number,
    }),
    rollover: t.union([t.strict({ veri: t.number }), t.null]),
    usage: t.array(
      t.strict({
        service: t.string,
        amount: t.number,
        timestamp: t.number,
      }),
    ),
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
  stashPool: boolean;

  @ApiProperty()
  atsIntegration: boolean;

  @ApiProperty()
  boostedVacancyMultiplier: number;

  @ApiProperty()
  extraSeats: number;

  @ApiProperty()
  expired: boolean;

  @ApiProperty()
  status: "active" | "inactive";

  @ApiProperty()
  duration: "monthly" | "yearly";

  @ApiProperty()
  createdTimestamp: number;

  @ApiProperty()
  expiryTimestamp: number;

  @ApiProperty()
  quota: {
    veri: number;
    seats: number;
  };

  @ApiProperty()
  rollover: {
    veri: number;
  } | null;

  @ApiProperty()
  usage: {
    service: string;
    amount: number;
    timestamp: number;
  }[];

  constructor(
    raw: Omit<
      Subscription,
      | "getEpochUsage"
      | "getEpochAggregateUsage"
      | "getCurrentEpochUsage"
      | "getCurrentEpochAggregateUsage"
      | "canAccessService"
    >,
  ) {
    const {
      id,
      tier,
      veri,
      usage,
      quota,
      status,
      rollover,
      duration,
      stashPool,
      stashAlert,
      extraSeats,
      atsIntegration,
      expiryTimestamp,
      createdTimestamp,
      boostedVacancyMultiplier,
    } = raw;
    const result = Subscription.SubscriptionType.decode({
      ...raw,
      expired: now() < expiryTimestamp ? false : true,
    });

    this.id = id;
    this.tier = tier;
    this.veri = veri;
    this.usage = usage;
    this.quota = quota;
    this.status = status;
    this.expired = now() < expiryTimestamp ? false : true;
    this.rollover = rollover;
    this.duration = duration;
    this.stashPool = stashPool;
    this.stashAlert = stashAlert;
    this.extraSeats = extraSeats;
    this.atsIntegration = atsIntegration;
    this.expiryTimestamp = expiryTimestamp;
    this.createdTimestamp = createdTimestamp;
    this.boostedVacancyMultiplier = boostedVacancyMultiplier;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `subscription instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }

  getEpochUsage(
    epochStart: number,
    epochEnd: number,
  ): { service: string; amount: number }[] {
    return this.usage.filter(
      x => epochStart >= x.timestamp && x.timestamp <= epochEnd,
    );
  }

  getCurrentEpochUsage(): { service: string; amount: number }[] {
    const epochStart = subMonths(this.expiryTimestamp, 1).getTime();
    return this.getEpochUsage(epochStart, now());
  }

  getEpochAggregateUsage(
    epochStart: number,
    epochEnd: number,
  ): { service: string; totalUsage: number }[] {
    return Array.from(
      this.usage
        .filter(x => epochStart >= x.timestamp && x.timestamp <= epochEnd)
        .reduce<Map<string, number>>((acc, usage) => {
          const existing = acc.get(usage.service);
          if (existing) {
            acc.set(usage.service, existing + usage.amount);
          } else {
            acc.set(usage.service, usage.amount);
          }
          return acc;
        }, new Map<string, number>()),
    ).map(x => ({
      service: x[0],
      totalUsage: x[1],
    }));
  }

  getCurrentEpochAggregateUsage(): { service: string; totalUsage: number }[] {
    const epochStart = subMonths(this.expiryTimestamp, 1).getTime();
    return this.getEpochAggregateUsage(epochStart, now());
  }

  canAccessService(
    service:
      | "veri"
      | "stashAlert"
      | "boostedVacancyMultiplier"
      | "atsIntegration",
  ): boolean {
    if (this.status === "active" && !this.expired) {
      if (service === "veri") {
        const epochUsage =
          this.getCurrentEpochAggregateUsage()?.find(x => x.service === service)
            ?.totalUsage ?? 0;
        const availableQuota = this.rollover?.veri
          ? this.rollover.veri + this.quota.veri
          : this.quota.veri;
        return availableQuota - epochUsage > 0;
      } else if (service === "boostedVacancyMultiplier") {
        return this.boostedVacancyMultiplier > 0;
      } else {
        return this[service];
      }
    } else {
      return false;
    }
  }
}
