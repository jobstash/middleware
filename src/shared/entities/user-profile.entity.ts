import { notStringOrNull } from "../helpers";
import { UserProfile } from "../interfaces";

export class UserProfileEntity {
  constructor(private readonly raw: UserProfile) {}

  getProperties(): UserProfile {
    return new UserProfile({
      ...this.raw,
      avatar: notStringOrNull(this.raw?.avatar),
      username: notStringOrNull(this.raw?.username),
      availableForWork: this.raw?.availableForWork ?? null,
      contact: {
        options: this.raw?.contact.options ?? [],
        value: notStringOrNull(this.raw?.contact?.value),
        preferred: notStringOrNull(this.raw?.contact?.preferred),
      },
    });
  }
}
