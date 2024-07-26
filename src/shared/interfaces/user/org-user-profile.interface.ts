import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class OrgUserProfile {
  public static readonly OrgUserProfileType = t.strict({
    wallet: t.string,
    linkedWallets: t.array(t.string),
    avatar: t.union([t.string, t.null]),
    username: t.union([t.string, t.null]),
    email: t.array(t.strict({ email: t.string, main: t.boolean })),
    linkedin: t.union([t.string, t.null]),
    calendly: t.union([t.string, t.null]),
    orgId: t.union([t.string, t.null]),
    contact: t.strict({
      value: t.union([t.string, t.null]),
      preferred: t.union([t.string, t.null]),
    }),
    subscriberStatus: t.strict({
      status: t.boolean,
      expires: t.union([t.number, t.null]),
    }),
    internalReference: t.strict({
      referencePersonName: t.union([t.string, t.null]),
      referencePersonRole: t.union([t.string, t.null]),
      referenceContact: t.union([t.string, t.null]),
      referenceContactPlatform: t.union([t.string, t.null]),
    }),
  });

  wallet: string;
  linkedWallets: string[];
  username: string | null;
  email: { email: string; main: boolean }[];
  linkedin: string | null;
  calendly: string | null;
  avatar: string | null;
  orgId: string | null;
  contact: {
    value: string | null;
    preferred: string | null;
  };
  subscriberStatus: {
    status: boolean;
    expires: number | null;
  };
  internalReference: {
    referencePersonName: string | null;
    referencePersonRole: string | null;
    referenceContact: string | null;
    referenceContactPlatform: string | null;
  };

  constructor(raw: OrgUserProfile) {
    const {
      wallet,
      linkedWallets,
      linkedin,
      calendly,
      orgId,
      username,
      avatar,
      contact,
      email,
      subscriberStatus,
      internalReference,
    } = raw;

    const result = OrgUserProfile.OrgUserProfileType.decode(raw);

    this.wallet = wallet;
    this.linkedWallets = linkedWallets;
    this.linkedin = linkedin;
    this.calendly = calendly;
    this.orgId = orgId;
    this.username = username;
    this.avatar = avatar;
    this.contact = contact;
    this.email = email;
    this.subscriberStatus = subscriberStatus;
    this.internalReference = internalReference;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org user profile instance with username ${this.username} failed validation with error '${x}'`,
        );
      });
    }
  }
}
