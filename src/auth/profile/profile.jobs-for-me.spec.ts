import { ProfileService } from "./profile.service";

describe("ProfileService Jobs For Me contract", () => {
  it("returns the canonical grouped response and preference receipt", async () => {
    const preferences = {
      workModes: ["remote"] as const,
      residenceCountry: "NL",
      utcOffset: 2,
      workAuthorization: "EU",
      requiresSponsorship: false,
      attendancePreference: "remote_only",
      travelTolerance: "one day per month",
    };
    const profiles = {
      getJobPreferences: jest.fn().mockResolvedValue(preferences),
      getJobMatchingCandidates: jest.fn().mockResolvedValue([
        {
          job: { shortUUID: "confirmed" },
          arrangementClassification: "verified_remote",
          options: [
            {
              classification: "verified_remote",
              mode: "remote",
              scope: "global",
              includedCountries: [],
              includedRegions: [],
              excludedCountries: [],
              excludedRegions: [],
              requiredUtcBand: null,
              preferredUtcBand: null,
              residencyRequirements: [],
              workAuthorizationRequirements: [],
              sponsorshipStatus: "available",
              officeCity: null,
              attendanceCadence: null,
              travelRequirement: null,
              confidence: "source_stated",
            },
          ],
        },
      ]),
    };
    const service = new ProfileService(
      profiles as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.getJobsForMe("wallet");

    expect(result).toEqual({
      confirmedMatches: [
        expect.objectContaining({
          job: { shortUUID: "confirmed" },
          needsChecking: [],
          optionalSignals: [],
        }),
      ],
      timezoneNearMisses: [],
      needsChecking: [],
      summary: {
        confirmedMatches: 1,
        timezoneNearMisses: 0,
        needsChecking: 0,
        total: 1,
      },
      appliedPreferences: preferences,
    });
    expect(result.confirmedMatches[0]).not.toHaveProperty("confirmed");
    expect(Object.keys(result.appliedPreferences).sort()).toEqual(
      [
        "attendancePreference",
        "requiresSponsorship",
        "residenceCountry",
        "travelTolerance",
        "utcOffset",
        "workAuthorization",
        "workModes",
      ].sort(),
    );
  });
});
