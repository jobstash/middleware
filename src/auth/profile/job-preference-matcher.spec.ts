import { JobPreferences, WorkLocationOption } from "src/shared/interfaces";
import { matchWorkLocationOptions } from "./job-preference-matcher";

const preferences: JobPreferences = {
  residenceCountry: "NL",
  residenceRegion: "EU",
  ianaTimezone: "Europe/Amsterdam",
  workAuthorizations: ["EU"],
  needsSponsorship: false,
  acceptableWorkModes: ["remote", "remote_or_office"],
  travelTolerance: null,
  useInferredCollaborationHours: false,
};

const option = (
  overrides: Partial<WorkLocationOption> = {},
): WorkLocationOption => ({
  mode: "remote",
  scope: "country_list",
  countries: ["NL", "PT"],
  regions: [],
  minimumUtcOffsetMinutes: 0,
  maximumUtcOffsetMinutes: 180,
  timezonePreferenceStrength: "required",
  residencyRequirement: null,
  workAuthorization: "EU",
  sponsorship: "unstated",
  officeLocation: null,
  attendanceCadence: null,
  confidence: 0.99,
  employerAuthoredRemoteEvidence: true,
  evidence: [{ text: "We can hire in NL or PT.", source: "job_description" }],
  ...overrides,
});

describe("matchWorkLocationOptions", () => {
  it("confirms cumulative country, timezone, and authorization constraints", () => {
    const match = matchWorkLocationOptions(
      { shortUUID: "job" },
      [option()],
      preferences,
      new Date("2026-01-15T12:00:00Z"),
    );
    expect(match).toEqual(expect.objectContaining({ confirmed: true }));
  });

  it("treats options as alternatives", () => {
    const match = matchWorkLocationOptions(
      { shortUUID: "job" },
      [
        option({ countries: ["US"] }),
        option({ scope: "global", countries: [] }),
      ],
      preferences,
    );
    expect(match?.option.scope).toBe("global");
  });

  it("never calls inherited-only evidence a remote match", () => {
    expect(
      matchWorkLocationOptions(
        { shortUUID: "job" },
        [option({ employerAuthoredRemoteEvidence: false })],
        preferences,
      ),
    ).toBeNull();
  });

  it("keeps unstated scope visible without confirming eligibility", () => {
    const match = matchWorkLocationOptions(
      { shortUUID: "job" },
      [option({ scope: "unstated", countries: [] })],
      preferences,
    );
    expect(match).toEqual(
      expect.objectContaining({
        confirmed: false,
        needsChecking: expect.arrayContaining([
          "The employer has not stated the geographic scope.",
        ]),
      }),
    );
  });

  it("shows team collaboration hours only when the user opts in", () => {
    const match = matchWorkLocationOptions(
      { shortUUID: "job" },
      [option()],
      { ...preferences, useInferredCollaborationHours: true },
      new Date("2026-01-15T12:00:00Z"),
      { minimumUtcMinute: 480, maximumUtcMinute: 1020 },
    );

    expect(match?.optionalSignals).toEqual([
      "Recent team activity is broadly concentrated between 08:00 and 17:00 UTC. This is context, not a work requirement.",
    ]);
  });

  it("does not expose inferred collaboration hours without permission", () => {
    const match = matchWorkLocationOptions(
      { shortUUID: "job" },
      [option()],
      preferences,
      new Date("2026-01-15T12:00:00Z"),
      { minimumUtcMinute: 480, maximumUtcMinute: 1020 },
    );

    expect(match?.optionalSignals).toEqual([]);
  });
});
