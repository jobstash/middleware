import { ApiProperty } from "@nestjs/swagger";
import { sort } from "fast-sort";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { now } from "lodash";

const METERED_SERVICES = ["veri", "jobPromotions"] as const;

const NON_METERED_SERVICES = [
  "stashAlert",
  "atsIntegration",
  "stashPool",
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

export class QuotaUsage {
  public static readonly QuotaUsageType = t.strict({
    id: t.string,
    service: MeteredService,
    amount: t.number,
    createdTimestamp: t.number,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  service: MeteredService;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  createdTimestamp: number;

  constructor(raw: QuotaUsage) {
    const { service, amount, createdTimestamp } = raw;
    this.service = service;
    this.amount = amount;
    this.createdTimestamp = createdTimestamp;

    const result = QuotaUsage.QuotaUsageType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(e => {
        throw new Error(
          `quota usage instance with id ${this.id} failed validation with error '${e}'`,
        );
      });
    }
  }
}

export class Quota {
  public static readonly QuotaType = t.strict({
    id: t.string,
    veri: t.number,
    jobPromotions: t.number,
    createdTimestamp: t.number,
    expiryTimestamp: t.number,
    usage: t.array(QuotaUsage.QuotaUsageType),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  veri: number;

  @ApiProperty()
  jobPromotions: number;

  @ApiProperty()
  createdTimestamp: number;

  @ApiProperty()
  expiryTimestamp: number;

  @ApiProperty()
  usage: QuotaUsage[];

  constructor(
    raw: Omit<
      Quota,
      | "isUsedUp"
      | "getQuotaAggregateUsage"
      | "getAvailableCredits"
      | "getAllAvailableCredits"
    >,
  ) {
    const {
      id,
      veri,
      jobPromotions,
      createdTimestamp,
      expiryTimestamp,
      usage,
    } = raw;
    const result = Quota.QuotaType.decode(raw);

    this.id = id;
    this.veri = veri;
    this.jobPromotions = jobPromotions;
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

  isUsedUp(service?: MeteredService): boolean {
    if (service) {
      return this.getAvailableCredits(service) === 0;
    } else {
      return METERED_SERVICES.every(
        (x: MeteredService) => this.getAvailableCredits(x) === 0,
      );
    }
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
    externalId: t.union([t.string, t.null]),
    veriPayg: t.boolean,
    stashPool: t.boolean,
    stashAlert: t.boolean,
    atsIntegration: t.boolean,
    jobPromotions: t.number,
    totalSeats: t.number,
    extraSeats: t.number,
    expired: t.boolean,
    status: t.union([t.literal("active"), t.literal("inactive")]),
    duration: t.union([t.literal("monthly"), t.literal("yearly")]),
    pendingChanges: t.union([
      t.strict({
        jobstash: t.union([t.string, t.null]),
        extraSeats: t.union([t.number, t.null]),
        veri: t.union([t.string, t.null]),
        stashAlert: t.union([t.boolean, t.null]),
        stashPool: t.union([t.boolean, t.null]),
        atsIntegration: t.union([t.boolean, t.null]),
        jobPromotions: t.union([t.number, t.null]),
        cancellationDate: t.union([t.number, t.null]),
      }),
      t.null,
    ]),
    createdTimestamp: t.number,
    expiryTimestamp: t.number,
    quota: t.array(Quota.QuotaType),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  tier: string;

  @ApiProperty()
  veri: string | null;

  @ApiProperty()
  externalId: string | null;

  @ApiProperty()
  veriPayg: boolean;

  @ApiProperty()
  stashAlert: boolean;

  @ApiProperty()
  stashPool: boolean;

  @ApiProperty()
  atsIntegration: boolean;

  @ApiProperty()
  jobPromotions: number;

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

  @ApiProperty()
  pendingChanges: {
    jobstash: string | null;
    extraSeats: number | null;
    veri: string | null;
    stashAlert: boolean | null;
    stashPool: boolean | null;
    atsIntegration: boolean | null;
    jobPromotions: number | null;
    cancellationDate: number | null;
  } | null;

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
      externalId,
      atsIntegration,
      expiryTimestamp,
      createdTimestamp,
      jobPromotions,
      veriPayg,
      pendingChanges,
    } = raw;
    const result = Subscription.SubscriptionType.decode({
      ...raw,
      pendingChanges: pendingChanges ?? null,
      totalSeats: extraSeats + 1,
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
    this.externalId = externalId;
    this.atsIntegration = atsIntegration;
    this.veriPayg = veriPayg;
    this.expiryTimestamp = expiryTimestamp;
    this.createdTimestamp = createdTimestamp;
    this.jobPromotions = jobPromotions;
    this.pendingChanges = pendingChanges ?? null;
    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `subscription instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }

  getEpochQuotas(epochEnd: number): Quota[] {
    // A quota is valid in an epoch if:
    // - It was created before or during the epoch AND
    // - Its explicit expiry timestamp hasn't passed
    return this.quota.filter(
      quota =>
        quota.createdTimestamp <= epochEnd && quota.expiryTimestamp >= epochEnd,
    );
  }

  getEpochAggregateQuota(epochEnd: number): Map<MeteredService, number> {
    // Sum up all quotas valid at epochEnd, regardless of billing cycle
    const validQuotas = this.getEpochQuotas(epochEnd);
    return new Map(
      METERED_SERVICES.map(service => [
        service,
        validQuotas.reduce((acc, quota) => acc + (quota[service] || 0), 0),
      ]),
    );
  }

  getEpochAggregateAvailableCredits(
    epochStart: number,
    epochEnd: number,
  ): Map<MeteredService, number> {
    // Calculate available credits for any epoch window
    const epochTotal = this.getEpochAggregateQuota(epochEnd);
    const epochUsage = this.getEpochAggregateUsage(epochStart, epochEnd);

    return new Map(
      METERED_SERVICES.map(service => [
        service,
        Math.max(
          0,
          (epochTotal.get(service) ?? 0) - (epochUsage.get(service) ?? 0),
        ),
      ]),
    );
  }

  getOldestActiveUnfilledQuota(service: MeteredService): Quota | undefined {
    const currentTime = now();
    // Filter for quotas that:
    // 1. Haven't explicitly expired
    // 2. Still have available credits for the service
    const activeQuotas = this.quota.filter(quota => {
      return currentTime <= quota.expiryTimestamp && !quota.isUsedUp(service);
    });

    // Return the oldest one by creation timestamp
    return sort(activeQuotas).asc(x => x.createdTimestamp)?.[0];
  }

  getEpochUsage(epochStart: number, epochEnd: number): QuotaUsage[] {
    // Get all usage that:
    // 1. Belongs to quotas valid at epochEnd
    // 2. Was logged within the specified epoch timeframe
    const quotas = this.getEpochQuotas(now());
    return quotas.reduce<QuotaUsage[]>((acc, quota) => {
      const validUsage = quota.usage.filter(
        usage =>
          usage.createdTimestamp >= epochStart &&
          usage.createdTimestamp <= epochEnd,
      );
      return [...acc, ...validUsage];
    }, []);
  }

  getCurrentEpochUsage(): QuotaUsage[] {
    const validQuotas = sort(this.getEpochQuotas(now())).asc(
      x => x.createdTimestamp,
    );
    const earliestQuota = validQuotas[0];
    const latestQuota = validQuotas[validQuotas.length - 1];
    return this.getEpochUsage(
      earliestQuota.createdTimestamp,
      latestQuota.expiryTimestamp,
    );
  }

  getEpochAggregateUsage(
    epochStart: number,
    epochEnd: number,
  ): Map<MeteredService, number> {
    // Sum up all usage per service within any epoch window
    const usage = this.getEpochUsage(epochStart, epochEnd);
    return usage.reduce<Map<MeteredService, number>>((acc, usage) => {
      const existing = acc.get(usage.service) || 0;
      acc.set(usage.service, existing + usage.amount);
      return acc;
    }, new Map<MeteredService, number>());
  }

  getCurrentEpochAggregateUsage(): Map<MeteredService, number> {
    const validQuotas = sort(this.getEpochQuotas(now())).asc(
      x => x.createdTimestamp,
    );
    const earliestQuota = validQuotas[0];
    const latestQuota = validQuotas[validQuotas.length - 1];
    return this.getEpochAggregateUsage(
      earliestQuota.createdTimestamp,
      latestQuota.expiryTimestamp,
    );
  }

  isActive(): boolean {
    return this.status === "active" && this.expiryTimestamp > now();
  }

  canAccessService(service: Service): boolean {
    if (this.isActive()) {
      if (service === "veri" || service === "jobPromotions") {
        const currentTime = now();
        const epochUsage =
          this.getCurrentEpochAggregateUsage().get(service) ?? 0;
        const availableQuota =
          this.getEpochAggregateQuota(currentTime).get(service) ?? 0;
        const hasQuota = availableQuota - epochUsage > 0;
        return (
          (service === "veri" && (hasQuota || this.veriPayg)) ||
          (service === "jobPromotions" && hasQuota)
        );
      } else {
        return !!this[service];
      }
    }
    return false;
  }
}
