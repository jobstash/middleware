import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class UserPermission {
  public static readonly UserPermissionType = t.strict({
    id: t.string,
    name: t.string,
    createdTimestamp: t.union([t.number, t.null]),
    updatedTimestamp: t.union([t.number, t.null]),
  });

  id: string;
  name: string;
  createdTimestamp: number | null;
  updatedTimestamp: number | null;

  constructor(raw: UserPermission) {
    const { id, name, createdTimestamp, updatedTimestamp } = raw;

    const result = UserPermission.UserPermissionType.decode(raw);

    this.id = id;
    this.name = name;
    this.createdTimestamp = createdTimestamp;
    this.updatedTimestamp = updatedTimestamp;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `user permission instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
