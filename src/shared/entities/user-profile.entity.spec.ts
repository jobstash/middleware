import { UserProfileEntity } from "./user-profile.entity";
import { UserProfile } from "../interfaces";

describe("UserProfileEntity alternate email filtering", () => {
  it("removes linked provider emails without deduplicating or case-folding alternates", () => {
    const raw: UserProfile = {
      wallet: "wallet",
      githubAvatar: null,
      name: null,
      alternateEmails: [
        "linked@example.com",
        "google@example.com",
        "apple@example.com",
        "LINKED@example.com",
        "other@example.com",
        "other@example.com",
      ],
      location: { city: null, country: null },
      availableForWork: false,
      cryptoNative: false,
      cryptoAdjacent: false,
      linkedAccounts: {
        email: "linked@example.com",
        google: "google@example.com",
        apple: "apple@example.com",
        github: null,
        discord: null,
        telegram: null,
        farcaster: null,
        twitter: null,
        wallets: [],
      },
    };
    const result = new UserProfileEntity(raw).getProperties();
    expect(result.alternateEmails).toEqual([
      "LINKED@example.com",
      "other@example.com",
      "other@example.com",
    ]);
    expect(raw.alternateEmails).toHaveLength(6);
  });
});
