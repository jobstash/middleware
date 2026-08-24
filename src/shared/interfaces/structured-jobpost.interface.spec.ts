import { StructuredJobpost } from "./structured-jobpost.interface";
import type { WorkArrangementV1 } from "./work-arrangement.interface";

const baseJob = {
  id: "job-1",
  shortUUID: "job-1",
  url: "https://employer.example/jobs/job-1",
  access: "public" as const,
  benefits: [],
  requirements: [],
  onboardIntoWeb3: false,
  ethSeasonOfInternships: false,
  responsibilities: [],
  title: "Forward Deployed Engineer",
  salary: null,
  summary: null,
  description: "Work remotely from the Netherlands.",
  culture: null,
  location: "Remote",
  seniority: null,
  paysInCrypto: null,
  featured: false,
  featureStartDate: null,
  featureEndDate: null,
  minimumSalary: null,
  maximumSalary: null,
  salaryCurrency: null,
  timestamp: 1,
  offersTokenAllocation: null,
};

describe("StructuredJobpost WorkArrangementV1", () => {
  it("preserves canonical mode-separated options in list/detail inheritance", () => {
    const workArrangement: WorkArrangementV1 = {
      classification: "verified_remote",
      fullyRemote: true,
      remoteOptions: [
        {
          classification: "verified_remote",
          mode: "remote",
          scope: "country_list",
          includedCountries: ["NL"],
          excludedCountries: [],
          includedRegions: ["EU"],
          excludedRegions: [],
          requiredUtcBand: {
            minimumUtcOffset: -3.5,
            maximumUtcOffset: 5.5,
          },
          preferredUtcBand: null,
          residencyRequirements: ["Resident of the Netherlands"],
          workAuthorizationRequirements: ["Authorized to work in the EU"],
          sponsorshipStatus: "unstated",
          officeCity: null,
          attendanceCadence: null,
          travelRequirement: null,
          confidence: "source_stated",
        },
      ],
      hybridOptions: [],
      onsiteOptions: [],
    };

    const result = new StructuredJobpost({
      ...baseJob,
      workArrangement,
    });

    expect(result.workArrangement).toEqual(workArrangement);
  });

  it("fails closed to an unstated, zero-option envelope for old projections", () => {
    const result = new StructuredJobpost(baseJob as StructuredJobpost);

    expect(result.workArrangement).toEqual({
      classification: "unstated",
      fullyRemote: null,
      remoteOptions: [],
      hybridOptions: [],
      onsiteOptions: [],
    });
  });
});
