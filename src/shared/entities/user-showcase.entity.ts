import { notStringOrNull } from "../helpers";
import { UserShowCase } from "../interfaces";

export class UserShowCaseEntity {
  constructor(private readonly raw: UserShowCase) {}

  getProperties(): UserShowCase {
    return new UserShowCase({
      label: notStringOrNull(this.raw?.label),
      url: notStringOrNull(this.raw?.url),
    });
  }
}
