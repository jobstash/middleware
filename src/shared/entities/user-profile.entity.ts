import { notStringOrNull } from "../helpers";
import { UserProfile } from "../interfaces";

export class UserProfileEntity {
  constructor(private readonly raw: UserProfile) {}

  getProperties(): UserProfile {
    const privyEmails = [
      this.raw?.linkedAccounts?.email,
      this.raw?.linkedAccounts?.google,
      this.raw?.linkedAccounts?.apple,
    ];
    return new UserProfile({
      ...this.raw,
      githubAvatar: notStringOrNull(this.raw?.githubAvatar),
      name: notStringOrNull(this.raw?.name),
      alternateEmails:
        this.raw?.alternateEmails.filter(x => !privyEmails.includes(x)) ?? [],
      location: {
        city: notStringOrNull(this.raw?.location?.city),
        country: notStringOrNull(this.raw?.location?.country),
      },
      availableForWork: this.raw?.availableForWork ?? false,
      cryptoNative: this.raw?.cryptoNative ?? false,
      cryptoAdjacent: this.raw?.cryptoAdjacent ?? false,
      linkedAccounts: {
        discord: notStringOrNull(this.raw?.linkedAccounts?.discord),
        telegram: notStringOrNull(this.raw?.linkedAccounts?.telegram),
        farcaster: notStringOrNull(this.raw?.linkedAccounts?.farcaster),
        twitter: notStringOrNull(this.raw?.linkedAccounts?.twitter),
        email: notStringOrNull(this.raw?.linkedAccounts?.email),
        wallets: this.raw?.linkedAccounts?.wallets ?? [],
        github: notStringOrNull(this.raw?.linkedAccounts?.github),
        google: notStringOrNull(this.raw?.linkedAccounts?.google),
        apple: notStringOrNull(this.raw?.linkedAccounts?.apple),
      },
    });
  }
}
