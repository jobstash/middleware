import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export const ContactTypes = [
  "email",
  "discord",
  "telegram",
  "farcaster",
  "lens",
  "twitter",
] as const;

const ContactType = t.keyof({
  ...ContactTypes.reduce((acc, name) => ({ ...acc, [name]: null }), {}),
});

export type ContactType = (typeof ContactTypes)[number];

export class UserProfile {
  public static readonly UserProfileType = t.strict({
    wallet: t.string,
    avatar: t.union([t.string, t.null]),
    username: t.union([t.string, t.null]),
    email: t.union([t.string, t.null]),
    preferred: ContactType,
    contact: t.strict({
      email: t.union([t.string, t.null]),
      discord: t.union([t.string, t.null]),
      telegram: t.union([t.string, t.null]),
      farcaster: t.union([t.string, t.null]),
      lens: t.union([t.string, t.null]),
      twitter: t.union([t.string, t.null]),
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
  preferred: ContactType;
  contact: {
    email: string | null;
    discord: string | null;
    telegram: string | null;
    farcaster: string | null;
    lens: string | null;
    twitter: string | null;
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
      preferred,
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
    this.preferred = preferred;
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
