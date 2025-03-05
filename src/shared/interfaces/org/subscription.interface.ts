import { ApiProperty } from "@nestjs/swagger";
import { subMonths } from "date-fns";
import { sort } from "fast-sort";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { now } from "lodash";

const METERED_SERVICES = ["veri"] as const;

const NON_METERED_SERVICES = [
  "stashAlert",
  "boostedVacancyMultiplier",
  "atsIntegration",
] as const;

export type MeteredService = (typeof METERED_SERVICES)[number];
const MeteredService = t.keyof({
  ...METERED_SERVICES.reduce(
    (acc, service) => ({ ...acc, [service]: null }),
    {},
  ),
});
export type NonMeteredService = (typeof NON_METERED_SERVICES)[number];
const NonMeteredService = t.keyof({
  ...NON_METERED_SERVICES.reduce(
    (acc, service) => ({ ...acc, [service]: null }),
    {},
  ),
});

export type Service = NonMeteredService | MeteredService;

export class Quota {
  public static readonly QuotaType = t.strict({
    id: t.string,
    veri: t.number,
    createdTimestamp: t.number,
    expiryTimestamp: t.number,
    usage: t.array(
      t.strict({
        service: MeteredService,
        amount: t.number,
        timestamp: t.number,
      }),
    ),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  veri: number;

  @ApiProperty()
  createdTimestamp: number;

  @ApiProperty()
  expiryTimestamp: number;

  @ApiProperty()
  usage: {
    service: MeteredService;
    amount: number;
    timestamp: number;
  }[];

  constructor(
    raw: Omit<
      Quota,
      | "isUsedUp"
      | "getQuotaAggregateUsage"
      | "getAvailableCredits"
      | "getAllAvailableCredits"
    >,
  ) {
    const { id, veri, createdTimestamp, expiryTimestamp, usage } = raw;
    const result = Quota.QuotaType.decode({
      ...raw,
    });

    this.id = id;
    this.veri = veri;
    this.createdTimestamp = createdTimestamp;
    this.expiryTimestamp = expiryTimestamp;
    this.usage = usage;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `quota instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }

  getQuotaAggregateUsage(): {
    service: MeteredService;
    totalUsage: number;
  }[] {
    const usage = this.usage.reduce((acc, usage) => {
      const existing = acc.get(usage.service);
      if (existing) {
        acc.set(usage.service, existing + usage.amount);
      } else {
        acc.set(usage.service, usage.amount);
      }
      return acc;
    }, new Map<MeteredService, number>());
    return Array.from(usage).map(x => ({
      service: x[0],
      totalUsage: x[1],
    }));
  }

  getAvailableCredits(service: MeteredService): number {
    const usage = this.getQuotaAggregateUsage();
    return this[service] - usage[service];
  }

  getAllAvailableCredits(): {
    service: MeteredService;
    availableCredits: number;
  }[] {
    return METERED_SERVICES.map(x => ({
      service: x,
      availableCredits: this.getAvailableCredits(x),
    }));
  }

  isUsedUp(): boolean {
    const usage = this.getQuotaAggregateUsage();
    return Object.keys(usage).every(
      (x: MeteredService) => this.getAvailableCredits(x) === 0,
    );
  }
}

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
    totalSeats: t.number,
    extraSeats: t.number,
    expired: t.boolean,
    status: t.union([t.literal("active"), t.literal("inactive")]),
    duration: t.union([t.literal("monthly"), t.literal("yearly")]),
    createdTimestamp: t.number,
    expiryTimestamp: t.number,
    quota: t.array(Quota.QuotaType),
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
  totalSeats: number;

  @ApiProperty()
  extraSeats: number;

  @ApiProperty()
  status: "active" | "inactive";

  @ApiProperty()
  duration: "monthly" | "yearly";

  @ApiProperty()
  createdTimestamp: number;

  @ApiProperty()
  expiryTimestamp: number;

  @ApiProperty()
  quota: Quota[];

  constructor(
    raw: Omit<
      Subscription,
      | "getEpochQuotas"
      | "getEpochAggregateQuota"
      | "getEpochAggregateAvailableCredits"
      | "getEpochUsage"
      | "getEpochAggregateUsage"
      | "getCurrentEpochUsage"
      | "getCurrentEpochAggregateUsage"
      | "getOldestActiveUnfilledQuota"
      | "canAccessService"
      | "isActive"
    >,
  ) {
    const {
      id,
      tier,
      veri,
      quota,
      status,
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
    this.quota = quota;
    this.status = status;
    this.duration = duration;
    this.stashPool = stashPool;
    this.stashAlert = stashAlert;
    this.totalSeats = extraSeats + 1;
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

  getEpochQuotas(epochEnd: number): Quota[] {
    return this.quota.filter(x => x.expiryTimestamp <= epochEnd);
  }

  getEpochAggregateQuota(epochEnd: number): Map<MeteredService, number> {
    const validQuotas = this.getEpochQuotas(epochEnd);
    return new Map(
      METERED_SERVICES.map(x => [
        x,
        validQuotas.reduce((acc, y) => acc + y[x], 0),
      ]),
    );
  }

  getEpochAggregateAvailableCredits(
    epochStart: number,
    epochEnd: number,
  ): Map<MeteredService, number> {
    const epochTotal = this.getEpochAggregateQuota(epochEnd);
    const epochUsage = this.getEpochAggregateUsage(epochStart, epochEnd);
    return new Map(
      METERED_SERVICES.map(x => [x, epochTotal.get(x) - epochUsage.get(x)]),
    );
  }

  getOldestActiveUnfilledQuota(): Quota | undefined {
    const epochEnd = now();
    const unfilledQuotas = (this.getEpochQuotas(epochEnd) ?? []).filter(
      x => !x.isUsedUp(),
    );
    return sort(unfilledQuotas).asc(x => x.expiryTimestamp)?.[0] ?? undefined;
  }

  getEpochUsage(
    epochStart: number,
    epochEnd: number,
  ): { service: MeteredService; amount: number; timestamp: number }[] {
    return this.getEpochQuotas(epochEnd).reduce((acc, x) => {
      const filtered = x.usage.filter(
        y => epochStart >= y.timestamp && y.timestamp <= epochEnd,
      );
      return [...acc, ...filtered];
    }, []);
  }

  getCurrentEpochUsage(): {
    service: MeteredService;
    amount: number;
    timestamp: number;
  }[] {
    const epochStart = subMonths(this.expiryTimestamp, 1).getTime();
    return this.getEpochUsage(epochStart, now());
  }

  getEpochAggregateUsage(
    epochStart: number,
    epochEnd: number,
  ): Map<MeteredService, number> {
    const usage = this.getEpochUsage(epochStart, epochEnd);
    return usage
      .filter(x => epochStart >= x.timestamp && x.timestamp <= epochEnd)
      .reduce<Map<MeteredService, number>>((acc, usage) => {
        const existing = acc.get(usage.service);
        if (existing) {
          acc.set(usage.service, existing + usage.amount);
        } else {
          acc.set(usage.service, usage.amount);
        }
        return acc;
      }, new Map<MeteredService, number>());
  }

  getCurrentEpochAggregateUsage(): Map<MeteredService, number> {
    const epochStart = subMonths(this.expiryTimestamp, 1).getTime();
    return this.getEpochAggregateUsage(epochStart, now());
  }

  isActive(): boolean {
    return this.status === "active" && this.expiryTimestamp < now();
  }

  canAccessService(service: Service): boolean {
    if (this.isActive()) {
      if (service === "veri") {
        const epochUsage =
          this.getCurrentEpochAggregateUsage().get(service) ?? 0;
        const availableQuota =
          this.getEpochAggregateQuota(now()).get(service) ?? 0;
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
