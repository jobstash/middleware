import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { UserRepo } from "../interfaces";

export class UserRepoEntity {
  constructor(private readonly raw: UserRepo) {}

  getProperties(): UserRepo {
    return new UserRepo({
      ...this.raw,
      projectName: notStringOrNull(this.raw.projectName),
      committers: nonZeroOrNull(this.raw.committers),
      tags: this.raw.tags ?? [],
      org: {
        ...this.raw.org,
        logo: notStringOrNull(this.raw?.org?.logo),
      },
      contribution: {
        ...this.raw.contribution,
        summary: notStringOrNull(this.raw?.contribution?.summary),
      },
    });
  }
}
