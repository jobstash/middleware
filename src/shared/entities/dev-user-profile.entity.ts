import { nonZeroOrNull, notStringOrNull } from "../helpers";
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
      email: this.raw?.email?.map(x => ({ ...x, main: x.main ?? false })) ?? [],
      note: notStringOrNull(this.raw?.note),
      availableForWork: this.raw?.availableForWork ?? false,
      cryptoNative: this.raw?.cryptoNative ?? false,
      cryptoAdjacent: this.raw?.cryptoAdjacent ?? false,
      preferred: this.raw.preferred?.type ?? "email",
      attestations: {
        upvotes: nonZeroOrNull(this.raw?.attestations?.upvotes),
        downvotes: nonZeroOrNull(this.raw?.attestations?.downvotes),
      },
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
      workHistory: this.raw?.workHistory?.map(workHistory => ({
        ...workHistory,
        name: notStringOrNull(workHistory.name),
        login: notStringOrNull(workHistory.login),
        logoUrl: notStringOrNull(workHistory.logoUrl),
        url: notStringOrNull(workHistory.url),
        description: notStringOrNull(workHistory.description),
        firstContributedAt: nonZeroOrNull(workHistory.firstContributedAt),
        lastContributedAt: nonZeroOrNull(workHistory.lastContributedAt),
        createdAt: nonZeroOrNull(workHistory.createdAt),
        repositories:
          workHistory?.repositories?.map(repository => ({
            ...repository,
            cryptoNative: repository?.cryptoNative ?? false,
            name: notStringOrNull(repository.name),
            firstContributedAt: nonZeroOrNull(repository.firstContributedAt),
            lastContributedAt: nonZeroOrNull(repository.lastContributedAt),
            commitsCount: nonZeroOrNull(repository.commitsCount),
            createdAt: nonZeroOrNull(repository.createdAt),
          })) ?? [],
      })),
      ecosystemActivations: this.raw?.ecosystemActivations ?? [],
    });
  }
}
