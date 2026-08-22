import { JobPreferences, WorkLocationOption } from "src/shared/interfaces";
import { matchWorkLocationOptions } from "./job-preference-matcher";

const option = (
  overrides: Partial<WorkLocationOption> = {},
): WorkLocationOption => ({
  classification: "verified_remote",
  mode: "remote",
  scope: "country_list",
  includedCountries: ["NL", "PT"],
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
  evidence: [
    {
      quote: "Remote in NL or PT",
      startOffset: 0,
      endOffset: 18,
      source: "employer_body",
      trust: "employer_body",
      provenance: "job-description",
    },
  ],
  ...overrides,
});

const preferences: JobPreferences = {
  workModes: ["remote"],
  residenceCountry: "NL",
  utcOffset: 2,
  workAuthorization: "EU",
  requiresSponsorship: false,
  attendancePreference: "remote_only",
  travelTolerance: "one day per month",
};

describe("matchWorkLocationOptions", () => {
  it("keeps a latest zero-option arrangement visible but unresolved", () => {
    expect(
      matchWorkLocationOptions({ shortUUID: "unstated" }, [], preferences),
    ).toEqual({
      group: "needsChecking",
      item: {
        job: { shortUUID: "unstated" },
        option: null,
        explanation:
          "The employer has not stated a current work arrangement or location eligibility.",
        needsChecking: [
          {
            code: "work_arrangement_unstated",
            message:
              "No current employer-authored work-arrangement evidence is available.",
          },
        ],
        optionalSignals: [],
      },
    });
  });

  it("keeps aggregator-only Remote visible as unqualified, not unstated", () => {
    expect(
      matchWorkLocationOptions(
        { shortUUID: "aggregator-remote" },
        [],
        preferences,
        "remote_unqualified",
      ),
    ).toEqual({
      group: "needsChecking",
      item: {
        job: { shortUUID: "aggregator-remote" },
        option: null,
        explanation:
          "A source labels this role Remote, but no employer-authored evidence verifies that claim.",
        needsChecking: [
          {
            code: "remote_evidence_unqualified",
            message:
              "Remote eligibility is based only on unverified aggregator evidence.",
          },
        ],
        optionalSignals: [],
      },
    });
  });

  it("confirms explicit worldwide employer evidence", () => {
    const result = matchWorkLocationOptions(
      { shortUUID: "global" },
      [option({ scope: "global", includedCountries: [] })],
      preferences,
    );

    expect(result).toEqual(
      expect.objectContaining({
        group: "confirmedMatches",
        item: expect.objectContaining({
          needsChecking: [],
          explanation: expect.stringContaining("open worldwide"),
        }),
      }),
    );
    expect(result?.item).not.toHaveProperty("confirmed");
  });

  it("keeps employer-authored bare Remote visible as unstated", () => {
    const result = matchWorkLocationOptions(
      { shortUUID: "bare" },
      [option({ scope: "unstated", includedCountries: [] })],
      preferences,
    );

    expect(result).toEqual(
      expect.objectContaining({
        group: "needsChecking",
        item: expect.objectContaining({
          needsChecking: expect.arrayContaining([
            {
              code: "geographic_scope_unstated",
              message: "The employer has not stated the geographic scope.",
            },
          ]),
        }),
      }),
    );
  });

  it("confirms an allowed payroll country and rejects another country", () => {
    expect(
      matchWorkLocationOptions(
        { shortUUID: "countries" },
        [option()],
        preferences,
      )?.group,
    ).toBe("confirmedMatches");
    expect(
      matchWorkLocationOptions({ shortUUID: "countries" }, [option()], {
        ...preferences,
        residenceCountry: "US",
      }),
    ).toBeNull();
  });

  it("uses fractional UTC offsets and groups a required one-hour miss", () => {
    const band = option({
      scope: "global",
      includedCountries: [],
      requiredUtcBand: { minimumUtcOffset: 5.5, maximumUtcOffset: 8 },
    });

    expect(
      matchWorkLocationOptions({ shortUUID: "inside" }, [band], {
        ...preferences,
        utcOffset: 5.5,
      })?.group,
    ).toBe("confirmedMatches");
    expect(
      matchWorkLocationOptions({ shortUUID: "near" }, [band], {
        ...preferences,
        utcOffset: 4.5,
      }),
    ).toEqual(
      expect.objectContaining({
        group: "timezoneNearMisses",
        item: expect.objectContaining({
          needsChecking: [],
          explanation: expect.stringContaining("no more than one hour"),
        }),
      }),
    );
    expect(
      matchWorkLocationOptions({ shortUUID: "far" }, [band], {
        ...preferences,
        utcOffset: 4,
      }),
    ).toBeNull();
  });

  it("keeps legal residency and work-authorization prose unresolved", () => {
    const result = matchWorkLocationOptions(
      { shortUUID: "legal" },
      [
        option({
          residencyRequirements: ["Must reside in the Netherlands"],
          workAuthorizationRequirements: [
            "Must already have EU working rights",
          ],
        }),
      ],
      preferences,
    );

    expect(result).toEqual(
      expect.objectContaining({
        group: "needsChecking",
        item: expect.objectContaining({
          needsChecking: expect.arrayContaining([
            expect.objectContaining({ code: "residency_review" }),
            expect.objectContaining({ code: "work_authorization_review" }),
          ]),
        }),
      }),
    );
  });

  it("evaluates remote and office arms separately", () => {
    const result = matchWorkLocationOptions(
      { shortUUID: "two-arms" },
      [
        option({
          mode: "onsite",
          officeCity: "Paris",
          attendanceCadence: "five days per week",
        }),
        option({
          mode: "remote",
          scope: "region",
          includedCountries: [],
          includedRegions: ["EU"],
        }),
      ],
      preferences,
    );

    expect(result?.item.option.mode).toBe("remote");
    expect(result?.group).toBe("confirmedMatches");
  });

  it("treats a soft timezone preference as needs checking, not exclusion", () => {
    const result = matchWorkLocationOptions(
      { shortUUID: "soft" },
      [
        option({
          scope: "global",
          includedCountries: [],
          preferredUtcBand: { minimumUtcOffset: -1, maximumUtcOffset: 1 },
        }),
      ],
      preferences,
    );

    expect(result).toEqual(
      expect.objectContaining({
        group: "confirmedMatches",
        item: expect.objectContaining({
          needsChecking: [],
          optionalSignals: [
            "Your UTC offset is outside the employer's preferred (not required) band.",
          ],
        }),
      }),
    );
  });

  it("never qualifies aggregator-only Remote", () => {
    expect(
      matchWorkLocationOptions(
        { shortUUID: "aggregator" },
        [
          option({
            scope: "global",
            includedCountries: [],
            classification: "remote_unqualified",
            evidence: [
              {
                quote: "Remote",
                startOffset: 0,
                endOffset: 6,
                source: "aggregator",
                trust: "aggregator",
                provenance: "aggregator-field",
              },
            ],
          }),
        ],
        preferences,
      ),
    ).toBeNull();
  });

  it("fails closed when remote evidence source and trust disagree", () => {
    expect(
      matchWorkLocationOptions(
        { shortUUID: "mismatched-evidence" },
        [
          option({
            scope: "global",
            includedCountries: [],
            evidence: [
              {
                quote: "Remote worldwide",
                startOffset: 0,
                endOffset: 16,
                source: "aggregator",
                trust: "employer_body",
                provenance: "aggregator-field",
              },
            ],
          }),
        ],
        preferences,
      ),
    ).toBeNull();
  });

  it("fails closed when two different employer evidence levels are paired", () => {
    expect(
      matchWorkLocationOptions(
        { shortUUID: "mismatched-employer-evidence" },
        [
          option({
            scope: "global",
            includedCountries: [],
            evidence: [
              {
                quote: "Remote worldwide",
                startOffset: 0,
                endOffset: 16,
                source: "employer_ats_field",
                trust: "employer_body",
                provenance: "ats.location",
              },
            ],
          }),
        ],
        preferences,
      ),
    ).toBeNull();
  });

  it("never confirms a conflicting work arrangement", () => {
    const result = matchWorkLocationOptions(
      { shortUUID: "conflicting" },
      [
        option({
          classification: "conflicting",
          scope: "global",
          includedCountries: [],
        }),
      ],
      preferences,
    );

    expect(result).toEqual(
      expect.objectContaining({
        group: "needsChecking",
        item: expect.objectContaining({
          needsChecking: expect.arrayContaining([
            expect.objectContaining({
              code: "conflicting_work_arrangement",
            }),
          ]),
        }),
      }),
    );
  });

  it("applies inclusion and exclusion constraints cumulatively", () => {
    expect(
      matchWorkLocationOptions(
        { shortUUID: "excluded" },
        [option({ excludedCountries: ["NL"] })],
        preferences,
      ),
    ).toBeNull();
  });

  it("prefers a confirmed option over an earlier unresolved option", () => {
    const result = matchWorkLocationOptions(
      { shortUUID: "alternatives" },
      [
        option({ scope: "unstated", includedCountries: [] }),
        option({ scope: "global", includedCountries: [] }),
      ],
      preferences,
    );
    expect(result?.group).toBe("confirmedMatches");
  });
});
