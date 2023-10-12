import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class UserProfile {
  public static readonly UserProfileType = t.strict({
    avatar: t.string,
    username: t.string,
    contact: t.strict({
      options: t.array(t.string),
      value: t.union([t.string, t.null]),
      preferred: t.union([t.string, t.null]),
    }),
    availableForWork: t.boolean,
  });

  avatar: string;
  username: string;
  contact: {
    options: string[];
    value: string | null;
    preferred: string | null;
  };
  availableForWork: boolean;

  constructor(raw: UserProfile) {
    const { avatar, username, availableForWork, contact } = raw;

    const result = UserProfile.UserProfileType.decode(raw);

    this.avatar = avatar;
    this.username = username;
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
