import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class UserProfile {
  public static readonly UserProfileType = t.strict({
    avatar: t.union([t.string, t.null]),
    username: t.union([t.string, t.null]),
    contact: t.strict({
      value: t.union([t.string, t.null]),
      preferred: t.union([t.string, t.null]),
    }),
    availableForWork: t.union([t.boolean, t.null]),
    role: t.union([t.string, t.null]),
    flow: t.union([t.string, t.null]),
  });

  avatar: string | null;
  username: string | null;
  contact: {
    value: string | null;
    preferred: string | null;
  };
  availableForWork: boolean | null;
  role: string | null;
  flow: string | null;

  constructor(raw: UserProfile) {
    const { avatar, username, availableForWork, contact, role, flow } = raw;

    const result = UserProfile.UserProfileType.decode(raw);

    this.avatar = avatar;
    this.username = username;
    this.flow = flow;
    this.role = role;
    this.contact = contact;
    this.availableForWork = availableForWork;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `user profile instance with username ${this.username} failed validation with error '${x}'`,
        );
      });
    }
  }
}
