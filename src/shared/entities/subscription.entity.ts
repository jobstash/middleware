import { nonZeroOrNull } from "../helpers";
import { Subscription } from "../interfaces/org";

export class SubscriptionEntity {
  constructor(private readonly raw: Subscription) {}

  getProperties(): Subscription {
    return new Subscription({
      ...this.raw,
      stashAlert: this.raw.stashAlert ?? false,
      extraSeats: nonZeroOrNull(this.raw.extraSeats),
      createdTimestamp: nonZeroOrNull(this.raw.createdTimestamp),
      quota: {
        veri: nonZeroOrNull(this.raw.quota.veri),
        seats: nonZeroOrNull(this.raw.quota.seats),
        stashPool: this.raw.quota.stashPool ?? false,
        atsIntegration: this.raw.quota.atsIntegration ?? false,
        boostedVacancyMultiplier: nonZeroOrNull(
          this.raw.quota.boostedVacancyMultiplier,
        ),
        stashAlert: this.raw.quota.stashAlert ?? false,
      },
    });
  }
}
