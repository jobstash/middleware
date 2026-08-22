import { toSignalCandidate } from "./user.service";

describe("Signals safe candidate projection", () => {
  it("cannot leak private/email/account/application fields or untyped nested extras", () => {
    const result = toSignalCandidate({
      wallet: "0xPublicOptIn",
      name: "Public Candidate",
      email: "secret@example.com",
      alternateEmails: ["secret@example.com"],
      linkedAccounts: {
        email: "secret@example.com",
        wallets: ["0xLinkedPrivate"],
      },
      note: "workspace private note",
      jobCategoryInterests: [{ classification: "ENGINEERING", frequency: 1 }],
      lastAppliedTimestamp: 42,
      location: { city: "Amsterdam", country: "NL", email: "x@example.com" },
      availableForWork: true,
      cryptoNative: true,
      cryptoAdjacent: false,
      skills: [
        {
          id: "skill-1",
          name: "TypeScript",
          normalizedName: "typescript",
          canTeach: true,
          contactEmail: "skill@example.com",
        },
      ],
      showcases: [
        {
          id: "showcase-1",
          label: "Public work",
          url: "https://example.com/work",
          email: "showcase@example.com",
        },
      ],
      workHistory: [],
    });

    expect(result).toEqual({
      wallet: "0xPublicOptIn",
      name: "Public Candidate",
      githubAvatar: null,
      location: { city: "Amsterdam", country: "NL" },
      availableForWork: true,
      cryptoNative: true,
      cryptoAdjacent: false,
      skills: [
        {
          id: "skill-1",
          name: "TypeScript",
          normalizedName: "typescript",
          canTeach: true,
        },
      ],
      showcases: [
        {
          id: "showcase-1",
          label: "Public work",
          url: "https://example.com/work",
        },
      ],
      workHistory: [],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /secret@example\.com|0xLinkedPrivate|workspace private note|lastAppliedTimestamp/,
    );
  });

  it("strips email-like values even when stored in an allowlisted field", () => {
    const result = toSignalCandidate({
      wallet: "candidate@example.com",
      name: "candidate@example.com",
      githubAvatar: null,
      location: { city: "candidate@example.com", country: "NL" },
      cryptoNative: false,
      cryptoAdjacent: false,
      skills: [],
      showcases: [],
      workHistory: [],
    });

    expect(JSON.stringify(result)).not.toContain("candidate@example.com");
  });
});
