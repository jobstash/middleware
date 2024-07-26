import { notStringOrNull } from "../helpers";
import { ContactType, UserProfile } from "../interfaces";

export type RawUserProfile = Omit<UserProfile, "preferred"> & {
  preferred: {
    type: ContactType;
    value: string | null;
  };
};

export class UserProfileEntity {
  constructor(private readonly raw: RawUserProfile) {}

  getProperties(): UserProfile {
    const preferredContactData = this.raw.preferred;
    const preferredContact = {
      [preferredContactData?.type ?? "email"]: notStringOrNull(
        preferredContactData?.value,
      ),
    };

    return new UserProfile({
      ...this.raw,
      linkedWallets: this.raw?.linkedWallets ?? [],
      avatar: notStringOrNull(this.raw?.avatar),
      username: notStringOrNull(this.raw?.username),
      email: this.raw?.email?.map(x => ({ ...x, main: x.main ?? false })) ?? [],
      availableForWork: this.raw?.availableForWork ?? false,
      preferred: this.raw.preferred?.type ?? "email",
      contact: {
        email: notStringOrNull(this.raw?.contact?.email),
        discord: notStringOrNull(this.raw?.contact?.discord),
        telegram: notStringOrNull(this.raw?.contact?.telegram),
        farcaster: notStringOrNull(this.raw?.contact?.farcaster),
        lens: notStringOrNull(this.raw?.contact?.lens),
        twitter: notStringOrNull(this.raw?.contact?.twitter),
        ...preferredContact,
      },
      location: {
        country: notStringOrNull(this.raw?.location?.country),
        city: notStringOrNull(this.raw?.location?.city),
      },
    });
  }
}
