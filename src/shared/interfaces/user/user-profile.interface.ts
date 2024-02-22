import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class UserProfile {
  public static readonly UserProfileType = t.strict({
    wallet: t.string,
    avatar: t.union([t.string, t.null]),
    username: t.union([t.string, t.null]),
    email: t.union([t.string, t.null]),
    contact: t.strict({
      value: t.union([t.string, t.null]),
      preferred: t.union([t.string, t.null]),
    }),
    location: t.strict({
      country: t.union([t.string, t.null]),
      city: t.union([t.string, t.null]),
    }),
    availableForWork: t.union([t.boolean, t.null]),
  });

  wallet: string;
  avatar: string | null;
  username: string | null;
  email: string | null;
  contact: {
    value: string | null;
    preferred: string | null;
  };
  location: {
    country: string | null;
    city: string | null;
  };
  availableForWork: boolean | null;

  constructor(raw: UserProfile) {
    const {
      wallet,
      avatar,
      username,
      email,
      availableForWork,
      contact,
      location,
    } = raw;

    const result = UserProfile.UserProfileType.decode(raw);

    this.wallet = wallet;
    this.avatar = avatar;
    this.email = email;
    this.username = username;
    this.contact = contact;
    this.location = location;
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
