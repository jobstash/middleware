import { nonZeroOrNull } from "../helpers";
import { TalentList, TalentListWithUsers } from "../interfaces";
import { UserAvailableForWorkEntity } from "./user-available-for-work.entity";

export class TalentListEntity {
  constructor(private readonly raw: TalentList) {}

  getProperties(): TalentList {
    return new TalentList({
      ...this.raw,
      createdTimestamp: nonZeroOrNull(this.raw.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(this.raw.updatedTimestamp),
    });
  }
}

export class TalentListWithUsersEntity {
  constructor(private readonly raw: TalentListWithUsers) {}

  getProperties(): TalentListWithUsers {
    return new TalentListWithUsers({
      ...this.raw,
      createdTimestamp: nonZeroOrNull(this.raw.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(this.raw.updatedTimestamp),
      users: this.raw.users.map(user =>
        new UserAvailableForWorkEntity(user).getProperties(),
      ),
    });
  }
}
