import { notStringOrNull } from "../helpers";
import { UserProfile } from "../interfaces";

export class UserProfileEntity {
  constructor(private readonly raw: UserProfile) {}

  getProperties(): UserProfile {
    return new UserProfile({
      ...this.raw,
      avatar: notStringOrNull(this.raw?.avatar),
      username: notStringOrNull(this.raw?.username),
      email: notStringOrNull(this.raw?.email),
      availableForWork: this.raw?.availableForWork ?? false,
      contact: {
        value: notStringOrNull(this.raw?.contact?.value),
        preferred: notStringOrNull(this.raw?.contact?.preferred),
      },
    });
  }
}
