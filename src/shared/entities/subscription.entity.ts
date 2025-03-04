import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { Subscription } from "../interfaces/org";

export class SubscriptionEntity {
  constructor(private readonly raw: Subscription) {}

  getProperties(): Subscription {
    return new Subscription({
      ...this.raw,
      status: this.raw.status,
      veri: notStringOrNull(this.raw.veri),
      stashAlert: this.raw.stashAlert ?? false,
      extraSeats: this.raw.extraSeats ?? 0,
      stashPool: this.raw.stashPool ?? false,
      atsIntegration: this.raw.atsIntegration ?? false,
      boostedVacancyMultiplier: this.raw.boostedVacancyMultiplier ?? 0,
      rollover: this.raw.rollover
        ? {
            veri: nonZeroOrNull(this.raw.rollover.veri) ?? 0,
          }
        : null,
      quota: {
        veri: nonZeroOrNull(this.raw.quota.veri) ?? 0,
        seats: nonZeroOrNull(this.raw.quota.seats) ?? 0,
      },
      usage:
        this.raw.usage.map(x => ({
          ...x,
          amount: nonZeroOrNull(x.amount),
          timestamp: nonZeroOrNull(x.timestamp),
        })) ?? [],
      expiryTimestamp: nonZeroOrNull(this.raw.expiryTimestamp),
      createdTimestamp: nonZeroOrNull(this.raw.createdTimestamp),
    });
  }
}
