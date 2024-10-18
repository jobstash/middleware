import { nonZeroOrNull } from "../helpers";
import { UserPermission } from "../interfaces";

export class UserPermissionEntity {
  constructor(private readonly raw: UserPermission) {}

  getProperties(): UserPermission {
    return new UserPermission({
      ...this.raw,
      createdTimestamp: nonZeroOrNull(this.raw.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(this.raw.updatedTimestamp),
    });
  }
}
