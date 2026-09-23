import { shouldGroupJobs } from "./job-feed.input";
import { JobListParams } from "./job-list.input";

describe("feed grouping policy", () => {
  it.each(["tags", "organizations", "projects", "cities"])(
    "does not group %s",
    key => {
      expect(shouldGroupJobs({ [key]: ["value"], workModes: ["remote"] })).toBe(
        false,
      );
      expect(shouldGroupJobs({ [key]: [] })).toBe(true);
    },
  );
  it.each([
    "classifications",
    "commitments",
    "seniority",
    "countries",
    "regions",
    "continents",
    "timezones",
    "workModes",
    "fundingRounds",
    "investors",
    "fundingStages",
    "chains",
    "collaborationHours",
  ])("groups %s", key => {
    expect(shouldGroupJobs({ [key]: ["value"] })).toBe(true);
  });
  it.each([
    "audits",
    "hacks",
    "token",
    "onboardIntoWeb3",
    "recentlyFunded",
    "newActiveLeads",
    "steppedDownLeads",
    "movedLeads",
    "earlyLeadDepartures",
  ])("groups boolean %s", key => {
    expect(shouldGroupJobs({ [key]: true })).toBe(true);
  });
  it.each([
    "minSalaryRange",
    "maxSalaryRange",
    "minHeadCount",
    "maxHeadCount",
    "minCurrentMaintainers",
    "maxCurrentMaintainers",
    "minActiveLeads",
    "maxActiveLeads",
    "minTvl",
    "maxTvl",
    "minMonthlyVolume",
    "maxMonthlyRevenue",
  ])("groups range %s", key => {
    expect(shouldGroupJobs({ [key]: 10 })).toBe(true);
  });
  it.each([
    { query: "engineer" },
    { titleQuery: "engineer" },
    { expertJobs: true },
    { organizationId: "org" },
    { orderBy: "salary" },
    { order: "asc" },
  ])("keeps individual results for %p", params => {
    expect(shouldGroupJobs(params as Partial<JobListParams>)).toBe(false);
  });
  it("ignores blank input and disabled expert filter", () => {
    expect(shouldGroupJobs({ query: " ", tags: [""], expertJobs: false })).toBe(
      true,
    );
    expect(shouldGroupJobs({ publicationDate: "past-3-months" })).toBe(true);
  });
});
