import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { Subscription } from "../interfaces/org";

export class SubscriptionEntity {
  constructor(private readonly raw: Subscription) {}

  getProperties(): Subscription {
    return new Subscription({
      ...this.raw,
      veri: notStringOrNull(this.raw.veri),
      stashAlert: this.raw.stashAlert ?? false,
      extraSeats: this.raw.extraSeats ?? 0,
      createdTimestamp: nonZeroOrNull(this.raw.createdTimestamp),
      quota: {
        veri: this.raw.quota.veri ?? 0,
        seats: this.raw.quota.seats ?? 0,
        stashPool: this.raw.quota.stashPool ?? false,
        atsIntegration: this.raw.quota.atsIntegration ?? false,
        boostedVacancyMultiplier: this.raw.quota.boostedVacancyMultiplier ?? 0,
        stashAlert: this.raw.quota.stashAlert ?? false,
      },
    });
  }
}
