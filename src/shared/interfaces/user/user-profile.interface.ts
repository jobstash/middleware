import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class UserProfile {
  public static readonly UserProfileType = t.strict({
    wallet: t.string,
    githubAvatar: t.union([t.string, t.null]),
    name: t.union([t.string, t.null]),
    alternateEmails: t.array(t.string),
    location: t.strict({
      city: t.union([t.string, t.null]),
      country: t.union([t.string, t.null]),
    }),
    availableForWork: t.union([t.boolean, t.null]),
    linkedAccounts: t.strict({
      discord: t.union([t.string, t.null]),
      telegram: t.union([t.string, t.null]),
      google: t.union([t.string, t.null]),
      apple: t.union([t.string, t.null]),
      github: t.union([t.string, t.null]),
      farcaster: t.union([t.string, t.null]),
      twitter: t.union([t.string, t.null]),
      email: t.union([t.string, t.null]),
      wallets: t.array(t.string),
    }),
  });

  wallet: string;
  githubAvatar: string | null;
  name: string | null;
  alternateEmails: string[];
  location: {
    city: string | null;
    country: string | null;
  };
  availableForWork: boolean;
  linkedAccounts: {
    discord: string | null;
    telegram: string | null;
    google: string | null;
    apple: string | null;
    github: string | null;
    farcaster: string | null;
    twitter: string | null;
    email: string | null;
    wallets: string[];
  };

  constructor(raw: UserProfile) {
    const {
      wallet,
      githubAvatar,
      name,
      alternateEmails,
      location,
      availableForWork,
      linkedAccounts,
    } = raw;

    const result = UserProfile.UserProfileType.decode(raw);

    this.wallet = wallet;
    this.githubAvatar = githubAvatar;
    this.alternateEmails = alternateEmails;
    this.name = name;
    this.location = location;
    this.linkedAccounts = linkedAccounts;
    this.availableForWork = availableForWork;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `user profile instance with username ${this.name} failed validation with error '${x}'`,
        );
      });
    }
  }
}
