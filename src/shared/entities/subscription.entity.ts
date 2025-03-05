import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { Quota, Subscription } from "../interfaces/org";

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
      quota: this.raw.quota.map(
        x =>
          new Quota({
            ...x,
            veri: nonZeroOrNull(x.veri) ?? 0,
            createdTimestamp: nonZeroOrNull(x.createdTimestamp),
            expiryTimestamp: nonZeroOrNull(x.expiryTimestamp),
            usage:
              x.usage.map(y => ({
                ...y,
                amount: nonZeroOrNull(y.amount),
                timestamp: nonZeroOrNull(y.timestamp),
              })) ?? [],
          }),
      ),
      expiryTimestamp: nonZeroOrNull(this.raw.expiryTimestamp),
      createdTimestamp: nonZeroOrNull(this.raw.createdTimestamp),
    });
  }
}
