import { notStringOrNull } from "../helpers";
import { UserProfile } from "../interfaces";

export class UserProfileEntity {
  constructor(private readonly raw: UserProfile) {}

  getProperties(): UserProfile {
    const { contact } = this.raw;
    return new UserProfile({
      ...this.raw,
      avatar: notStringOrNull(this.raw.avatar),
      contact: {
        ...contact,
        value: notStringOrNull(contact?.value),
        preferred: notStringOrNull(contact?.preferred),
      },
    });
  }
}
