import { toAgencyCandidateReport, toSignalCandidate } from "./user.service";

describe("Signals Agency candidate projection", () => {
  it("exposes one contact email without leaking account/application fields or untyped nested extras", () => {
    const result = toSignalCandidate({
      wallet: "0xPublicOptIn",
      name: "Public Candidate",
      email: "contact@example.com",
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
      github: null,
      email: "contact@example.com",
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
      github: "candidate@example.com",
      location: { city: "candidate@example.com", country: "NL" },
      cryptoNative: false,
      cryptoAdjacent: false,
      skills: [],
      showcases: [],
      workHistory: [],
    });

    expect(JSON.stringify(result)).not.toContain("candidate@example.com");
    expect(result.email).toBeNull();
  });

  it("normalizes missing work-history timestamps for the Signals contract", () => {
    const result = toSignalCandidate({
      wallet: "0x123",
      availableForWork: true,
      workHistory: [
        {
          login: "example-org",
          createdAt: 1,
          repositories: [
            {
              name: "example-repo",
              url: "https://github.com/example-org/example-repo",
              createdAt: 1,
            },
          ],
        },
      ],
    });

    expect(result.workHistory[0].updatedAt).toBeNull();
    expect(result.workHistory[0].repositories[0].updatedAt).toBeNull();
  });

  it("builds a candidate report from the Agency Signals fields", () => {
    const candidate = toSignalCandidate({
      wallet: "0xCandidate",
      name: "Ada",
      githubAvatar: null,
      github: "ada",
      location: { city: "Amsterdam", country: "NL" },
      cryptoNative: true,
      cryptoAdjacent: false,
      skills: [],
      showcases: [],
      workHistory: [
        {
          login: "second",
          name: "Second",
          logoUrl: null,
          description: null,
          url: "https://github.com/second",
          firstContributedAt: 20,
          lastContributedAt: 40,
          commitsCount: 2,
          tenure: 20,
          cryptoNative: false,
          repositories: [
            {
              name: "two",
              url: "https://github.com/second/two",
              description: null,
              commitsCount: 2,
              firstContributedAt: 20,
              lastContributedAt: 40,
              skills: [],
              tenure: 20,
              stars: 3,
              cryptoNative: false,
              createdAt: 20,
              updatedAt: null,
            },
          ],
          createdAt: 20,
          updatedAt: null,
        },
        {
          login: "first",
          name: "First",
          logoUrl: null,
          description: null,
          url: "https://github.com/first",
          firstContributedAt: 10,
          lastContributedAt: 50,
          commitsCount: 10,
          tenure: 40,
          cryptoNative: true,
          repositories: [
            {
              name: "one",
              url: "https://github.com/first/one",
              description: null,
              commitsCount: 10,
              firstContributedAt: 10,
              lastContributedAt: 50,
              skills: ["TypeScript"],
              tenure: 40,
              stars: 7,
              cryptoNative: true,
              createdAt: 10,
              updatedAt: null,
            },
          ],
          createdAt: 10,
          updatedAt: null,
        },
      ],
    });

    const report = toAgencyCandidateReport(candidate);

    expect(report.summary).toEqual({
      organizationCount: 2,
      repositoryCount: 2,
      totalCommits: 12,
      totalStars: 10,
      averageTenure: 30,
      firstContributedAt: 10,
      lastContributedAt: 50,
    });
    expect(report.topOrganizations.map(({ login }) => login)).toEqual([
      "first",
      "second",
    ]);
    expect(report.candidate.email).toBeNull();
    expect(JSON.stringify(report)).not.toMatch(
      /note|application|linkedAccounts/i,
    );
  });
});
