import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { UserWorkHistory } from "../interfaces";

export class UserWorkHistoryEntity {
  constructor(private readonly raw: UserWorkHistory) {}

  getProperties(): UserWorkHistory {
    const workHistory = this.raw;
    return new UserWorkHistory({
      ...workHistory,
      name: notStringOrNull(workHistory.name),
      login: notStringOrNull(workHistory.login),
      logoUrl: notStringOrNull(workHistory.logoUrl),
      url: notStringOrNull(workHistory.url),
      description: notStringOrNull(workHistory.description),
      firstContributedAt: nonZeroOrNull(workHistory.firstContributedAt),
      lastContributedAt: nonZeroOrNull(workHistory.lastContributedAt),
      cryptoNative: workHistory?.cryptoNative ?? false,
      repositories:
        workHistory?.repositories?.map(repository => ({
          ...repository,
          cryptoNative: repository?.cryptoNative ?? false,
          description: notStringOrNull(repository.description),
          name: notStringOrNull(repository.name),
          firstContributedAt: nonZeroOrNull(repository.firstContributedAt),
          lastContributedAt: nonZeroOrNull(repository.lastContributedAt),
          commitsCount: nonZeroOrNull(repository.commitsCount),
          createdAt: nonZeroOrNull(repository.createdAt),
        })) ?? [],
      createdAt: nonZeroOrNull(workHistory.createdAt),
    });
  }
}
