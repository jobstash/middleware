import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { UserRepo } from "../interfaces";

export class UserRepoEntity {
  constructor(private readonly raw: UserRepo) {}

  getProperties(): UserRepo {
    return new UserRepo({
      ...this.raw,
      id: notStringOrNull(this.raw.id),
      timestamp: nonZeroOrNull(this.raw.timestamp),
      projectName: notStringOrNull(this.raw.projectName),
      committers: nonZeroOrNull(this.raw.committers),
      tags:
        this.raw.tags?.map(tag => ({
          ...tag,
          canTeach: tag.canTeach ?? false,
        })) ?? [],
      org: {
        ...this.raw.org,
        logo: notStringOrNull(this.raw?.org?.logo),
      },
      contribution: {
        ...this.raw.contribution,
        count: nonZeroOrNull(this.raw.contribution.count),
        summary: notStringOrNull(this.raw?.contribution?.summary),
      },
    });
  }
}
