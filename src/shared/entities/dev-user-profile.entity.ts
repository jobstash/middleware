import { notStringOrNull } from "../helpers";
import { DevUserProfile } from "../interfaces";
import { UserShowCaseEntity } from "./user-showcase.entity";
import { UserSkillEntity } from "./user-skill.entity";

export class DevUserProfileEntity {
  constructor(private readonly raw: DevUserProfile) {}

  getProperties(): DevUserProfile {
    return new DevUserProfile({
      ...this.raw,
      avatar: notStringOrNull(this.raw?.avatar),
      username: notStringOrNull(this.raw?.username),
      email: notStringOrNull(this.raw?.email),
      availableForWork: this.raw?.availableForWork ?? false,
      contact: {
        value: notStringOrNull(this.raw?.contact?.value),
        preferred: notStringOrNull(this.raw?.contact?.preferred),
      },
      location: {
        country: notStringOrNull(this.raw?.location?.country),
        city: notStringOrNull(this.raw?.location?.city),
      },
      skills:
        this.raw?.skills?.map(skill =>
          new UserSkillEntity(skill).getProperties(),
        ) ?? [],
      showcases:
        this.raw?.showcases?.map(showcase =>
          new UserShowCaseEntity(showcase).getProperties(),
        ) ?? [],
    });
  }
}
