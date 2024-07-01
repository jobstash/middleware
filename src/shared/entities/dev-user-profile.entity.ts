import { notStringOrNull } from "../helpers";
import { ContactType, DevUserProfile } from "../interfaces";
import { UserShowCaseEntity } from "./user-showcase.entity";
import { UserSkillEntity } from "./user-skill.entity";

type RawDevUserProfile = Omit<DevUserProfile, "preferred"> & {
  preferred: {
    type: ContactType;
    value: string | null;
  };
};

export class DevUserProfileEntity {
  constructor(private readonly raw: RawDevUserProfile) {}

  getProperties(): DevUserProfile {
    const preferredContactData = this.raw.preferred;
    const preferredContact = {
      [preferredContactData?.type ?? "email"]: notStringOrNull(
        preferredContactData?.value,
      ),
    };

    return new DevUserProfile({
      ...this.raw,
      avatar: notStringOrNull(this.raw?.avatar),
      username: notStringOrNull(this.raw?.username),
      email: notStringOrNull(this.raw?.email),
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
