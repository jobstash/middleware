import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { UserAvailableForWork } from "../interfaces";
import { UserShowCaseEntity } from "./user-showcase.entity";
import { UserSkillEntity } from "./user-skill.entity";

export class UserAvailableForWorkEntity {
  constructor(private readonly raw: UserAvailableForWork) {}

  getProperties(): UserAvailableForWork {
    return new UserAvailableForWork({
      ...this.raw,
      note: notStringOrNull(this.raw?.note?.trim()),
      cryptoNative: this.raw?.cryptoNative ?? false,
      cryptoAdjacent: this.raw?.cryptoAdjacent ?? false,
      attestations: {
        upvotes: nonZeroOrNull(this.raw?.attestations?.upvotes),
        downvotes: nonZeroOrNull(this.raw?.attestations?.downvotes),
      },
      githubAvatar: notStringOrNull(this.raw?.githubAvatar),
      name: notStringOrNull(this.raw?.name?.trim()),
      alternateEmails: this.raw?.alternateEmails ?? [],
      location: {
        city: notStringOrNull(this.raw?.location?.city?.trim()),
        country: notStringOrNull(this.raw?.location?.country?.trim()),
      },
      availableForWork: this.raw?.availableForWork ?? false,
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
            name: notStringOrNull(repository.name?.trim()),
            description: notStringOrNull(repository.description?.trim()),
            firstContributedAt: nonZeroOrNull(repository.firstContributedAt),
            lastContributedAt: nonZeroOrNull(repository.lastContributedAt),
            commitsCount: nonZeroOrNull(repository.commitsCount),
            createdAt: nonZeroOrNull(repository.createdAt),
            updatedAt: nonZeroOrNull(repository.updatedAt),
          })) ?? [],
      })),
      ecosystemActivations: this.raw?.ecosystemActivations ?? [],
      jobCategoryInterests:
        this.raw?.jobCategoryInterests
          .map(interest => ({
            classification: interest.classification ?? "N/A",
            frequency: nonZeroOrNull(interest.frequency),
          }))
          .filter(interest => interest.classification !== "N/A") ?? [],
      tags:
        this.raw?.tags
          .map(tag => ({
            tag: tag.tag ?? "N/A",
            frequency: nonZeroOrNull(tag.frequency),
          }))
          .filter(tag => tag.tag !== "N/A") ?? [],
      lastAppliedTimestamp: nonZeroOrNull(this.raw?.lastAppliedTimestamp),
    });
  }
}
