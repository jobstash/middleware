import { notStringOrNull } from "../helpers";
import { UserProfile } from "../interfaces";

export class UserProfileEntity {
  constructor(private readonly raw: UserProfile) {}

  getProperties(): UserProfile {
    return new UserProfile({
      ...this.raw,
      avatar: notStringOrNull(this.raw?.avatar),
      username: notStringOrNull(this.raw?.username),
      role: notStringOrNull(this.raw?.role),
      flow: notStringOrNull(this.raw?.flow),
      availableForWork: this.raw?.availableForWork ?? null,
      contact: {
        value: notStringOrNull(this.raw?.contact?.value),
        preferred: notStringOrNull(this.raw?.contact?.preferred),
      },
    });
  }
}
