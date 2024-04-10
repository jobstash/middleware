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
    });
  }
}
