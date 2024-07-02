import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { UserRepo } from "../interfaces";

export class UserRepoEntity {
  constructor(private readonly raw: UserRepo) {}

  getProperties(): UserRepo {
    return new UserRepo({
      ...this.raw,
      id: notStringOrNull(this.raw.id),
      timestamp: nonZeroOrNull(this.raw.timestamp),
      tags:
        this.raw.tags?.map(tag => ({
          ...tag,
          canTeach: tag.canTeach ?? false,
        })) ?? [],
      org: {
        ...this.raw.org,
        logo: notStringOrNull(this.raw?.org?.logo),
      },
      contribution: notStringOrNull(this.raw?.contribution),
    });
  }
}
